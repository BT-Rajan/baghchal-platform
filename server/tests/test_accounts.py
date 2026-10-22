from typing import Any

import httpx
import pytest
from argon2 import PasswordHasher as Argon2
from fastapi import FastAPI
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer

from .conftest import AGREE, PASSWORD, Clock, last_token, sign_up

REGISTER = "/api/v1/auth/register"
VERIFY = "/api/v1/auth/verify-email"
LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
RESET = "/api/v1/auth/password-reset"
RESET_CONFIRM = "/api/v1/auth/password-reset/confirm"
ME = "/api/v1/me"


def _db(app: FastAPI) -> AsyncSession:
    state: AppState = app.state.ctx
    return state.sessions()


async def _users(app: FastAPI) -> list[User]:
    async with _db(app) as db:
        return list(await db.scalars(select(User)))


# ── Registration ──────────────────────────────────────────────────────────


async def test_sign_up_signs_in_at_once(client: httpx.AsyncClient, mailer: MemoryMailer) -> None:
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "Alice", "email": "Alice@Example.com", "password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["username"] == "Alice"
    assert body["token"] is None
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    # The confirmation email still goes out, but nothing waits for it.
    assert mailer.outbox[-1].to == "Alice@example.com"  # domain normalised
    assert "/verify-email?token=" in mailer.outbox[-1].body
    r = await client.get(ME)
    assert r.status_code == 200
    assert r.json()["email"] == "Alice@example.com"
    r = await client.post("/api/v1/games/computer", json={"level": "easy"})
    assert r.status_code == 201, r.text  # unconfirmed accounts play

    # Signing in again works before the address is confirmed.
    await client.post(LOGOUT)
    r = await client.post(LOGIN, json={"login": "alice", "password": PASSWORD})
    assert r.status_code == 200, r.text

    r = await client.post(VERIFY, json={"token": last_token(mailer)})
    assert r.status_code == 200


async def test_sign_up_with_a_bearer_token(
    app_client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    r = await app_client.post(
        REGISTER,
        json={
            **AGREE,
            "username": "alice",
            "email": "a@example.com",
            "password": PASSWORD,
            "transport": "bearer",
        },
    )
    assert r.status_code == 201, r.text
    assert "set-cookie" not in r.headers
    token = r.json()["token"]
    r = await app_client.get(ME, headers={"authorization": f"Bearer {token}"})
    assert (r.status_code, r.json()["username"]) == (200, "alice")
    assert len(mailer.outbox) == 1


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({**AGREE, "username": "ab", "email": "a@example.com", "password": PASSWORD}, "username"),
        (
            {**AGREE, "username": "_alice", "email": "a@example.com", "password": PASSWORD},
            "username",
        ),
        (
            {**AGREE, "username": "al ice", "email": "a@example.com", "password": PASSWORD},
            "username",
        ),
        (
            {**AGREE, "username": "a" * 21, "email": "a@example.com", "password": PASSWORD},
            "username",
        ),
        ({**AGREE, "username": "alice", "email": "not-an-email", "password": PASSWORD}, "email"),
        ({**AGREE, "username": "alice", "email": "a@example.com", "password": "short"}, "password"),
        (
            {**AGREE, "username": "alice", "email": "a@example.com", "password": "x" * 129},
            "password",
        ),
        (
            {**AGREE, "username": "alice", "email": "a@example.com", "password": 1234567890},
            "password",
        ),
        ({**AGREE, "username": "alice", "email": "a@example.com"}, "password"),
    ],
)
async def test_registration_validation(
    client: httpx.AsyncClient, payload: dict[str, object], field: str
) -> None:
    r = await client.post(REGISTER, json=payload)
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "invalid_request"
    assert [f["field"] for f in error["fields"]] == [field]
    assert PASSWORD not in r.text


async def test_unknown_fields_are_rejected(client: httpx.AsyncClient) -> None:
    r = await client.post(
        REGISTER,
        json={
            **AGREE,
            "username": "alice",
            "email": "a@example.com",
            "password": PASSWORD,
            "admin": True,
        },
    )
    assert r.status_code == 422


async def test_reserved_username(client: httpx.AsyncClient) -> None:
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "Admin", "email": "a@example.com", "password": PASSWORD},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "username_unavailable"


async def test_password_must_differ_from_username(client: httpx.AsyncClient) -> None:
    r = await client.post(
        REGISTER,
        json={
            **AGREE,
            "username": "alicealice",
            "email": "a@example.com",
            "password": "AliceAlice",
        },
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "weak_password"


async def test_usernames_are_unique_ignoring_case(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "ALICE", "email": "other@example.com", "password": PASSWORD},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "username_taken"


async def test_an_email_in_use_is_refused(
    client: httpx.AsyncClient, mailer: MemoryMailer, app: FastAPI
) -> None:
    await sign_up(client, mailer)
    sent = len(mailer.outbox)
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "bob", "email": "ALICE@example.com", "password": PASSWORD},
    )
    assert r.status_code == 409
    assert r.json()["error"] == {
        "code": "email_taken",
        "message": "That email is already in use. Sign in instead.",
    } | {k: v for k, v in r.json()["error"].items() if k not in {"code", "message"}}
    assert len(mailer.outbox) == sent
    assert [u.username for u in await _users(app)] == ["alice"]


async def test_an_unconfirmed_address_is_in_use_too(
    client: httpx.AsyncClient, app: FastAPI, clock: Clock
) -> None:
    """An account plays before it is confirmed, so its address and name stay taken, even
    long after; the address's owner can reset the password instead."""
    await client.post(
        REGISTER,
        json={**AGREE, "username": "mallory1", "email": "v@example.com", "password": "mallory pw"},
    )
    clock.advance(days=30)
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "victim", "email": "v@example.com", "password": PASSWORD},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (409, "email_taken")
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "Mallory1", "email": "x@example.com", "password": PASSWORD},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (409, "username_taken")
    assert [u.username for u in await _users(app)] == ["mallory1"]


async def test_taken_answers_are_rate_limited(client: httpx.AsyncClient) -> None:
    await client.post(
        REGISTER,
        json={**AGREE, "username": "alice", "email": "a@example.com", "password": PASSWORD},
    )
    codes = []
    for i in range(31):
        r = await client.post(
            REGISTER,
            json={**AGREE, "username": "alice", "email": f"u{i}@example.com", "password": PASSWORD},
        )
        codes.append(r.status_code)
    assert codes[:30] == [409] * 30
    assert codes[30] == 429


async def test_registration_race_is_handled(
    client: httpx.AsyncClient, app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Two sign-ups for one name or address at once: the loser is told it is taken, not a
    crash."""
    await client.post(
        REGISTER,
        json={**AGREE, "username": "alice", "email": "first@example.com", "password": PASSWORD},
    )
    real_scalar = AsyncSession.scalar
    calls = 0

    async def blind_scalar(self: AsyncSession, *args: Any, **kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        if calls <= 2:  # the two "already exists?" checks miss, as if the rival committed late
            return None
        return await real_scalar(self, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "scalar", blind_scalar)
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "alice", "email": "second@example.com", "password": PASSWORD},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "username_taken"

    calls = 0
    r = await client.post(
        REGISTER,
        json={**AGREE, "username": "carol", "email": "first@example.com", "password": PASSWORD},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (409, "email_taken")


# ── Verification tokens ───────────────────────────────────────────────────


async def test_verification_link_works_once(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    r = await client.post(VERIFY, json={"token": last_token(mailer)})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_token"


async def test_verification_link_expires(
    client: httpx.AsyncClient, mailer: MemoryMailer, clock: Clock
) -> None:
    await client.post(
        REGISTER,
        json={**AGREE, "username": "alice", "email": "a@example.com", "password": PASSWORD},
    )
    clock.advance(hours=24, seconds=1)
    r = await client.post(VERIFY, json={"token": last_token(mailer)})
    assert r.status_code == 400


@pytest.mark.parametrize("token", ["", "x" * 43, "a" * 42, "!" * 43])
async def test_malformed_or_unknown_tokens(client: httpx.AsyncClient, token: str) -> None:
    r = await client.post(VERIFY, json={"token": token})
    assert r.status_code in (400, 422)


# ── Login, sessions, logout ───────────────────────────────────────────────


@pytest.mark.parametrize("login", ["alice", "ALICE", "alice@example.com", " Alice@Example.COM "])
async def test_login_with_username_or_email(
    client: httpx.AsyncClient, mailer: MemoryMailer, login: str
) -> None:
    await sign_up(client, mailer)
    client.cookies.clear()
    r = await client.post(LOGIN, json={"login": login, "password": PASSWORD})
    assert r.status_code == 200
    assert (await client.get(ME)).status_code == 200


async def test_wrong_password_and_unknown_user_look_the_same(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    wrong = await client.post(LOGIN, json={"login": "alice", "password": "wrong password"})
    unknown = await client.post(LOGIN, json={"login": "nobody", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_bearer_sessions_for_apps(
    client: httpx.AsyncClient, app_client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    r = await app_client.post(
        LOGIN, json={"login": "alice", "password": PASSWORD, "transport": "bearer"}
    )
    assert r.status_code == 200
    assert "set-cookie" not in r.headers
    token = r.json()["token"]
    auth = {"authorization": f"Bearer {token}"}
    assert (await app_client.get(ME, headers=auth)).json()["username"] == "alice"
    assert (await app_client.post(LOGOUT, headers=auth)).status_code == 204
    assert (await app_client.get(ME, headers=auth)).status_code == 401


async def test_logout_revokes_the_cookie_session(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    old_cookie = dict(client.cookies)
    r = await client.post(LOGOUT)
    assert r.status_code == 204
    assert 'session=""' in r.headers["set-cookie"]
    client.cookies.update(old_cookie)  # replaying the old cookie must not work
    assert (await client.get(ME)).status_code == 401


async def test_logout_without_a_session_is_harmless(client: httpx.AsyncClient) -> None:
    assert (await client.post(LOGOUT)).status_code == 204


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"authorization": "Bearer nonsense"},
        {"authorization": "Basic abc"},
        {"authorization": "Bearer " + "x" * 100},
    ],
)
async def test_me_requires_a_valid_session(
    app_client: httpx.AsyncClient, headers: dict[str, str]
) -> None:
    r = await app_client.get(ME, headers=headers)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "not_authenticated"


async def test_sessions_expire(
    client: httpx.AsyncClient, mailer: MemoryMailer, clock: Clock
) -> None:
    await sign_up(client, mailer)
    clock.advance(days=29)
    assert (await client.get(ME)).status_code == 200
    clock.advance(days=1, seconds=1)
    assert (await client.get(ME)).status_code == 401


async def test_session_last_used_is_updated_sparingly(
    client: httpx.AsyncClient, mailer: MemoryMailer, clock: Clock, app: FastAPI
) -> None:
    await sign_up(client, mailer)
    start = clock.now
    clock.advance(minutes=1)
    await client.get(ME)
    async with _db(app) as db:
        assert (await db.scalar(select(func.max(Session.last_used_at)))) == start
    clock.advance(minutes=10)
    await client.get(ME)
    async with _db(app) as db:
        assert (await db.scalar(select(func.max(Session.last_used_at)))) == clock.now


async def test_disabled_accounts_are_locked_out(
    client: httpx.AsyncClient, mailer: MemoryMailer, app: FastAPI
) -> None:
    await sign_up(client, mailer)
    async with _db(app) as db:
        await db.execute(update(User).values(is_active=False))
        await db.commit()
    assert (await client.get(ME)).status_code == 401
    r = await client.post(LOGIN, json={"login": "alice", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "account_disabled"
    r = await client.post(RESET, json={"email": "alice@example.com"})
    assert r.status_code == 202
    assert "Reset" not in mailer.outbox[-1].subject


async def test_old_password_hashes_are_upgraded_on_login(
    client: httpx.AsyncClient, mailer: MemoryMailer, app: FastAPI
) -> None:
    await sign_up(client, mailer)
    state: AppState = app.state.ctx
    weak = Argon2(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    async with _db(app) as db:
        await db.execute(update(User).values(password_hash=weak))
        await db.commit()
    assert state.hasher.needs_rehash(weak)
    r = await client.post(LOGIN, json={"login": "alice", "password": PASSWORD})
    assert r.status_code == 200
    async with _db(app) as db:
        upgraded = await db.scalar(select(User.password_hash))
    assert upgraded != weak
    assert upgraded is not None
    assert not state.hasher.needs_rehash(upgraded)


# ── Password reset ────────────────────────────────────────────────────────


async def test_password_reset(
    client: httpx.AsyncClient, app_client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    other_device = await app_client.post(
        LOGIN, json={"login": "alice", "password": PASSWORD, "transport": "bearer"}
    )
    auth = {"authorization": f"Bearer {other_device.json()['token']}"}

    r = await client.post(RESET, json={"email": "ALICE@example.com"})
    assert r.status_code == 202
    assert mailer.outbox[-1].subject == "Reset your ClawPlay password"
    token = last_token(mailer)

    new_password = "a brand new passphrase"
    r = await client.post(RESET_CONFIRM, json={"token": token, "password": new_password})
    assert r.status_code == 204
    # Signed out everywhere; only the new password works; the link is spent.
    assert (await client.get(ME)).status_code == 401
    assert (await app_client.get(ME, headers=auth)).status_code == 401
    assert (
        await client.post(LOGIN, json={"login": "alice", "password": PASSWORD})
    ).status_code == 401
    assert (
        await client.post(LOGIN, json={"login": "alice", "password": new_password})
    ).status_code == 200
    r = await client.post(
        RESET_CONFIRM, json={"token": token, "password": "yet another passphrase"}
    )
    assert r.status_code == 400


async def test_password_reset_works_before_the_address_is_confirmed(
    client: httpx.AsyncClient, mailer: MemoryMailer, app: FastAPI
) -> None:
    await client.post(
        REGISTER,
        json={**AGREE, "username": "alice", "email": "a@example.com", "password": PASSWORD},
    )
    r = await client.post(RESET, json={"email": "a@example.com"})
    assert r.status_code == 202
    assert mailer.outbox[-1].subject == "Reset your ClawPlay password"
    r = await client.post(
        RESET_CONFIRM, json={"token": last_token(mailer), "password": "a brand new passphrase"}
    )
    assert r.status_code == 204
    async with _db(app) as db:
        assert await db.scalar(select(User.email_verified_at)) is not None  # proved it


async def test_password_reset_for_unknown_email_looks_the_same(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    r = await client.post(RESET, json={"email": "nobody@example.com"})
    assert r.status_code == 202
    assert r.json() == {"status": "accepted"}
    assert mailer.outbox == []


async def test_only_the_latest_reset_link_works(
    client: httpx.AsyncClient, mailer: MemoryMailer, clock: Clock
) -> None:
    await sign_up(client, mailer)
    await client.post(RESET, json={"email": "alice@example.com"})
    first = last_token(mailer)
    await client.post(RESET, json={"email": "alice@example.com"})
    second = last_token(mailer)
    new = "a brand new passphrase"
    assert (
        await client.post(RESET_CONFIRM, json={"token": first, "password": new})
    ).status_code == 400
    clock.advance(hours=1, seconds=1)
    assert (
        await client.post(RESET_CONFIRM, json={"token": second, "password": new})
    ).status_code == 400


async def test_reset_rejects_username_as_password(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer, username="alicealice")
    await client.post(RESET, json={"email": "alice@example.com"})
    token = last_token(mailer)
    r = await client.post(RESET_CONFIRM, json={"token": token, "password": "ALICEALICE"})
    assert r.status_code == 422
    # The rejected attempt did not spend the link.
    r = await client.post(RESET_CONFIRM, json={"token": token, "password": "a fine passphrase"})
    assert r.status_code == 204


async def test_reset_link_for_deleted_account(
    client: httpx.AsyncClient, mailer: MemoryMailer, app: FastAPI
) -> None:
    await sign_up(client, mailer)
    await client.post(RESET, json={"email": "alice@example.com"})
    token = last_token(mailer)
    async with _db(app) as db:
        await db.execute(update(User).values(is_active=False))
        await db.commit()
    r = await client.post(RESET_CONFIRM, json={"token": token, "password": "a fine passphrase"})
    assert r.status_code == 400


async def test_tokens_are_stored_hashed(
    client: httpx.AsyncClient, mailer: MemoryMailer, app: FastAPI
) -> None:
    await sign_up(client, mailer)
    cookie = next(iter(client.cookies.values()))
    async with _db(app) as db:
        stored = [s.token_hash for s in await db.scalars(select(Session))]
        stored += [t.token_hash for t in await db.scalars(select(EmailToken))]
    assert cookie not in stored
    assert last_token(mailer) not in stored
    assert all(len(h) == 64 for h in stored)


async def test_a_lost_confirmation_link_can_be_sent_again(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    body = {**AGREE, "username": "zed", "email": "zed@example.com", "password": PASSWORD}
    assert (await client.post("/api/v1/auth/register", json=body)).status_code == 201
    resend = "/api/v1/auth/verify-email/resend"
    r = await client.post(resend, json={"email": "ZED@example.com"})
    assert r.status_code == 202
    assert len(mailer.outbox) == 2
    assert mailer.outbox[-1].subject == "Confirm your ClawPlay account"
    r = await client.post("/api/v1/auth/verify-email", json={"token": last_token(mailer)})
    assert r.status_code == 200
    # Confirmed, or never registered: the same answer, and nothing sent.
    for email in ("zed@example.com", "nobody@example.com"):
        assert (await client.post(resend, json={"email": email})).status_code == 202
    assert len(mailer.outbox) == 2
