"""Changing a password or email address, exporting your data, and deleting your account."""

from contextlib import AsyncExitStack
from datetime import timedelta

import httpx
from fastapi import FastAPI
from sqlalchemy import select

from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.deps import AppState
from baghchal_server.lobby.models import Block
from baghchal_server.mail import MemoryMailer

from .conftest import PASSWORD, Clock, Player, PlayerFactory, last_token, sign_up
from .test_games import FIVE_CAPTURES, _event, _online, _play, _start

NEW_PASSWORD = "a brand new passphrase"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/me"
PASSWORD_CHANGE = "/api/v1/me/password"
EMAIL_CHANGE = "/api/v1/me/email"
EMAIL_CONFIRM = "/api/v1/auth/confirm-email"
EXPORT = "/api/v1/me/export"
DELETE = "/api/v1/me/delete"


async def _login(
    app: FastAPI, login: str, password: str = PASSWORD
) -> tuple[httpx.Response, httpx.AsyncClient]:
    http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
    r = await http.post(LOGIN, json={"login": login, "password": password, "transport": "bearer"})
    if r.status_code == 200:
        http.headers["authorization"] = f"Bearer {r.json()['token']}"
    return r, http


# ── Password ──────────────────────────────────────────────────────────────


async def test_changing_the_password_signs_out_other_devices(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    _, laptop = await _login(app, "alice")
    r = await alice.http.post(
        PASSWORD_CHANGE,
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 204, r.text
    assert (await alice.http.get(ME)).status_code == 200  # this device stays signed in
    assert (await laptop.get(ME)).status_code == 401
    await laptop.aclose()
    assert mailer.outbox[-1].subject == "Your Bagh Chal password was changed"
    assert "/forgot-password" in mailer.outbox[-1].body
    assert (await _login(app, "alice"))[0].status_code == 401
    r, http = await _login(app, "alice", NEW_PASSWORD)
    await http.aclose()
    assert r.status_code == 200


async def test_password_change_checks(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.post(
        PASSWORD_CHANGE, json={"current_password": "wrong", "new_password": NEW_PASSWORD}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (403, "wrong_password")
    r = await alice.http.post(
        PASSWORD_CHANGE, json={"current_password": PASSWORD, "new_password": "Alice"}
    )
    assert r.status_code == 422  # too short


async def test_a_password_equal_to_the_username_is_refused(
    app: FastAPI, players: PlayerFactory
) -> None:
    lena = await players("lenalenalena")
    r = await lena.http.post(
        PASSWORD_CHANGE, json={"current_password": PASSWORD, "new_password": "LenaLenaLena"}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (422, "weak_password")


async def test_password_guesses_are_limited(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    for _ in range(10):
        r = await alice.http.post(DELETE, json={"password": "guess"})
        assert r.status_code == 403
    r = await alice.http.post(DELETE, json={"password": PASSWORD})
    assert r.status_code == 429


async def test_changing_the_password_cancels_reset_links(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    await alice.http.post("/api/v1/auth/password-reset", json={"email": "alice@example.com"})
    reset = last_token(mailer)
    await alice.http.post(
        PASSWORD_CHANGE, json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}
    )
    r = await alice.http.post(
        "/api/v1/auth/password-reset/confirm", json={"token": reset, "password": "x" * 12}
    )
    assert r.json()["error"]["code"] == "invalid_token"


# ── Email address ─────────────────────────────────────────────────────────


async def test_changing_the_email_address(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    await alice.http.post("/api/v1/auth/password-reset", json={"email": "alice@example.com"})
    old_reset = last_token(mailer)

    r = await alice.http.post(EMAIL_CHANGE, json={"password": PASSWORD, "email": "new@example.org"})
    assert r.status_code == 202, r.text
    mail = mailer.outbox[-1]
    assert (mail.to, mail.subject) == (
        "new@example.org",
        "Confirm your new Bagh Chal email address",
    )
    assert "/confirm-email?token=" in mail.body
    token = last_token(mailer)
    assert (await alice.http.get(ME)).json()["email"] == "alice@example.com"  # not yet

    # The link works on any device, signed in or not.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as phone:
        r = await phone.post(EMAIL_CONFIRM, json={"token": token})
        assert r.status_code == 200, r.text
        assert r.json() == {"email": "new@example.org"}
        assert (await phone.post(EMAIL_CONFIRM, json={"token": token})).status_code == 400
    assert (await alice.http.get(ME)).json()["email"] == "new@example.org"
    notice = mailer.outbox[-1]
    assert (notice.to, notice.subject) == (
        "alice@example.com",
        "Your Bagh Chal email address was changed",
    )
    r, http = await _login(app, "new@example.org")
    await http.aclose()
    assert r.status_code == 200
    # A reset link sent to the old address no longer works.
    r = await alice.http.post(
        "/api/v1/auth/password-reset/confirm", json={"token": old_reset, "password": "x" * 12}
    )
    assert r.json()["error"]["code"] == "invalid_token"


async def test_email_change_checks(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.post(EMAIL_CHANGE, json={"password": "nope", "email": "new@example.org"})
    assert r.json()["error"]["code"] == "wrong_password"
    r = await alice.http.post(
        EMAIL_CHANGE, json={"password": PASSWORD, "email": "ALICE@example.com"}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (422, "same_email")
    r = await alice.http.post(EMAIL_CHANGE, json={"password": PASSWORD, "email": "not an email"})
    assert r.status_code == 422


async def test_an_address_in_use_is_not_revealed(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    alice, _ = await players("alice"), await players("bob")
    r = await alice.http.post(EMAIL_CHANGE, json={"password": PASSWORD, "email": "bob@example.com"})
    assert r.status_code == 202
    mail = mailer.outbox[-1]
    assert (mail.to, mail.subject) == ("bob@example.com", "You already have a Bagh Chal account")


async def test_an_address_taken_before_confirming(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, client: httpx.AsyncClient
) -> None:
    alice = await players("alice")
    await alice.http.post(EMAIL_CHANGE, json={"password": PASSWORD, "email": "new@example.org"})
    token = last_token(mailer)
    await sign_up(client, mailer, "newbie", "new@example.org")
    r = await alice.http.post(EMAIL_CONFIRM, json={"token": token})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "email_taken")
    assert (await alice.http.get(ME)).json()["email"] == "alice@example.com"


async def test_an_abandoned_sign_up_does_not_hold_the_address(
    app: FastAPI,
    players: PlayerFactory,
    mailer: MemoryMailer,
    client: httpx.AsyncClient,
    clock: Clock,
) -> None:
    alice = await players("alice")
    await client.post(
        "/api/v1/auth/register",
        json={"username": "ghost", "email": "new@example.org", "password": PASSWORD},
    )
    clock.advance(hours=23)
    r = await alice.http.post(EMAIL_CHANGE, json={"password": PASSWORD, "email": "new@example.org"})
    token = last_token(mailer)
    assert mailer.outbox[-1].subject == "Confirm your new Bagh Chal email address"
    clock.advance(hours=2)  # the sign-up has now expired; the change link has not
    r = await alice.http.post(EMAIL_CONFIRM, json={"token": token})
    assert r.status_code == 200, r.text


async def test_email_change_links_expire(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, clock: Clock
) -> None:
    alice = await players("alice")
    await alice.http.post(EMAIL_CHANGE, json={"password": PASSWORD, "email": "new@example.org"})
    clock.advance(hours=24, seconds=1)
    r = await alice.http.post(EMAIL_CONFIRM, json={"token": last_token(mailer)})
    assert r.json()["error"]["code"] == "invalid_token"


# ── Export ────────────────────────────────────────────────────────────────


async def test_exporting_my_data(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        game = await _start(alice, bob, "3+2")
        await _play(alice, bob, game, FIVE_CAPTURES[:3])
        await alice.http.post(f"/api/v1/games/{game['id']}/resign")
        r = await carol.http.post(
            "/api/v1/challenges", json={"opponent": "alice", "time_control": "10+5"}
        )
        assert r.status_code == 201
    await alice.http.put("/api/v1/blocks/bob")

    r = await alice.http.get(EXPORT)
    assert r.status_code == 200, r.text
    assert r.headers["content-disposition"] == 'attachment; filename="baghchal-alice.json"'
    data = r.json()
    assert data["account"]["username"] == "alice"
    assert data["account"]["email"] == "alice@example.com"
    assert data["ratings"] == []
    (exported,) = data["games"]
    assert {k: exported[k] for k in ("time_control", "side", "opponent", "winner", "moves")} == {
        "time_control": "3+2",
        "side": "goat",
        "opponent": "bob",
        "winner": "tiger",
        "moves": FIVE_CAPTURES[:3],
    }
    assert [(c["direction"], c["opponent"], c["status"]) for c in data["challenges"]] == [
        ("sent", "bob", "accepted"),
        ("received", "carol", "pending"),
    ]
    assert data["blocked_players"] == ["bob"]
    assert len(data["sessions"]) == 1

    # Bob's side of the same game.
    (theirs,) = (await bob.http.get(EXPORT)).json()["games"]
    assert (theirs["side"], theirs["opponent"]) == ("tiger", "alice")


async def test_an_opponent_who_deleted_their_account_shows_anonymously(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    assert (await bob.http.post(DELETE, json={"password": PASSWORD})).status_code == 204
    r = await alice.http.get(EXPORT)
    assert r.status_code == 200, r.text
    assert r.json()["games"][0]["opponent"].startswith("deleted-")
    assert r.json()["challenges"][0]["opponent"].startswith("deleted-")


async def test_a_new_player_exports_little(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    data = (await alice.http.get(EXPORT)).json()
    assert (data["games"], data["challenges"], data["blocked_players"]) == ([], [], [])


async def test_exports_are_limited(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    for _ in range(10):
        assert (await alice.http.get(EXPORT)).status_code == 200
    assert (await alice.http.get(EXPORT)).status_code == 429


# ── Deletion ──────────────────────────────────────────────────────────────


async def test_deleting_my_account(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, client: httpx.AsyncClient
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        _, bob_ws, carol_ws = await _online(app, stack, alice, bob, carol)
        game = await _start(alice, bob)
        await alice.http.post(f"/api/v1/games/{game['id']}/resign")
        sent = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "5+3"}
        )
        received = await carol.http.post(
            "/api/v1/challenges", json={"opponent": "alice", "time_control": "5+3"}
        )
        assert (sent.status_code, received.status_code) == (201, 201)

        r = await alice.http.post(DELETE, json={"password": PASSWORD})
        assert r.status_code == 204, r.text
        # Both open challenges are closed, and the other players are told.
        for ws, challenge, status in (
            (bob_ws, sent, "cancelled"),
            (carol_ws, received, "declined"),
        ):
            event = await _event(ws, "challenge")
            while event["challenge"]["id"] != challenge.json()["id"] or (
                event["challenge"]["status"] == "pending"
            ):
                event = await _event(ws, "challenge")
            assert event["challenge"]["status"] == status

    assert (await alice.http.get(ME)).status_code == 401
    assert (await _login(app, "alice"))[0].status_code == 401
    assert (await _login(app, "alice@example.com"))[0].status_code == 401
    assert mailer.outbox[-1].to == "alice@example.com"
    assert mailer.outbox[-1].subject == "Your Bagh Chal account was deleted"

    # Gone from the lobby; the game stays in bob's history under an anonymous name.
    assert (await bob.http.get("/api/v1/players/alice")).status_code == 404
    assert (await bob.http.get("/api/v1/players", params={"prefix": "del"})).json() == []
    old = (await bob.http.get(f"/api/v1/games/{game['id']}")).json()
    assert old["goat"]["username"].startswith("deleted-")
    assert len(old["goat"]["username"]) == 20
    assert (await bob.http.get("/api/v1/challenges")).json() == {"incoming": [], "outgoing": []}

    # The name and the address are free again; names of deleted accounts are not.
    await sign_up(client, mailer, "alice", "alice@example.com")
    r = await client.post(
        "/api/v1/auth/register",
        json={"username": old["goat"]["username"], "email": "x@example.com", "password": PASSWORD},
    )
    assert r.json()["error"]["code"] == "username_unavailable"


async def test_deleting_signs_the_browser_out(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    r = await client.post(DELETE, json={"password": PASSWORD})
    assert r.status_code == 204
    assert "session=" in r.headers["set-cookie"]
    assert "Max-Age=0" in r.headers["set-cookie"] or "expires=" in r.headers["set-cookie"].lower()
    assert (await client.get(ME)).status_code == 401


async def test_deletion_checks(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    r = await alice.http.post(DELETE, json={"password": "wrong"})
    assert (r.status_code, r.json()["error"]["code"]) == (403, "wrong_password")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        await _start(alice, bob)
        r = await alice.http.post(DELETE, json={"password": PASSWORD})
        assert (r.status_code, r.json()["error"]["code"]) == (409, "game_in_progress")
    assert (await alice.http.get(ME)).status_code == 200


async def test_a_deleted_player_keeps_no_personal_data(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice: Player = await players("alice")
    bob = await players("bob")
    await alice.http.put("/api/v1/blocks/bob")
    await bob.http.put("/api/v1/blocks/alice")
    await alice.http.post("/api/v1/auth/password-reset", json={"email": "alice@example.com"})
    clock.advance(seconds=timedelta(minutes=1).total_seconds())
    await alice.http.post(DELETE, json={"password": PASSWORD})
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        user = await db.scalar(select(User).where(User.username != "bob"))
        assert user is not None
        assert "alice" not in f"{user.username} {user.email} {user.username_key} {user.email_key}"
        assert user.email.endswith("@deleted.invalid")
        assert user.password_hash == "!"  # the unusable placeholder
        assert not user.is_active
        assert user.deleted_at == clock.now
        assert await db.scalar(select(Session).where(Session.user_id == user.id)) is None
        assert await db.scalar(select(EmailToken).where(EmailToken.user_id == user.id)) is None
        assert await db.scalar(select(Block)) is None
