"""Guests: play at once without signing up, and keep everything when making an account."""

import secrets
import uuid
from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, update

from baghchal_server import housekeeping
from baghchal_server.accounts.models import User
from baghchal_server.games.models import ActiveGame, Game, GameStatus
from baghchal_server.mail import MemoryMailer

from .conftest import AGREE, ORIGIN, PASSWORD, PlayerFactory, last_token
from .test_games import _online

GUEST = "/api/v1/auth/guest"
CLAIM = "/api/v1/me/claim"


def _browser(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        headers={"Origin": ORIGIN},
    )


async def _guest(http: httpx.AsyncClient) -> dict[str, Any]:
    r = await http.post(
        GUEST,
        json={
            **AGREE,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["user"]  # type: ignore[no-any-return]


async def test_a_guest_plays_at_once(app: FastAPI) -> None:
    async with _browser(app) as http:
        me = await _guest(http)
        assert me["username"].startswith("guest-")
        assert me["role"] == "guest"
        assert (await http.get("/api/v1/me")).json()["id"] == me["id"]

        r = await http.post("/api/v1/games/computer", json={"level": "easy"})
        assert r.status_code == 201, r.text
        await http.post(f"/api/v1/games/{r.json()['id']}/resign")
        r = await http.post("/api/v1/seeks", json={"time_control": "5+3"})
        assert r.status_code == 200, r.text
        await http.delete("/api/v1/seeks")

        # Rated play and anything social needs an account.
        for method, path, body in (
            ("POST", "/api/v1/seeks", {"time_control": "5+3", "rated": True}),
            ("POST", "/api/v1/challenges", {"opponent": "bob", "time_control": "5+3"}),
            ("POST", "/api/v1/players/bob/report", {"reason": "abuse"}),
            ("POST", "/api/v1/payments/checkout", {"plan": "plus", "period": "month"}),
            ("POST", "/api/v1/me/email", {"password": "x", "email": "a@example.com"}),
        ):
            r = await http.request(method, path, json=body)
            assert (r.status_code, r.json()["error"]["message"]) == (
                403,
                "Make a free account to do this.",
            ), path

    # Nobody can sign in to a guest account.
    async with _browser(app) as other:
        r = await other.post(
            "/api/v1/auth/login", json={"login": me["username"], "password": PASSWORD}
        )
        assert r.status_code == 401


async def test_native_apps_get_a_token(app_client: httpx.AsyncClient) -> None:
    r = await app_client.post(GUEST, json={**AGREE, "transport": "bearer"})
    token = r.json()["token"]
    r = await app_client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["role"] == "guest"


async def test_guests_play_casual_games_only(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    async with _browser(app) as http, AsyncExitStack() as stack:
        me = await _guest(http)
        await _online(app, stack, alice)
        # A guest cannot be offered a rated game.
        r = await alice.http.post(
            "/api/v1/challenges",
            json={"opponent": me["username"], "time_control": "5+3", "rated": True},
        )
        assert (r.status_code, r.json()["error"]["code"]) == (409, "guest_plays_casual")


async def test_making_an_account_keeps_the_games(app: FastAPI, mailer: MemoryMailer) -> None:
    async with _browser(app) as http:
        me = await _guest(http)
        game = (await http.post("/api/v1/games/computer", json={"level": "easy"})).json()
        await http.post(f"/api/v1/games/{game['id']}/resign")

        claim = {**AGREE, "username": "Sita", "email": "sita@example.com", "password": PASSWORD}
        r = await http.post(CLAIM, json=claim)
        assert r.status_code == 200, r.text
        assert (r.json()["id"], r.json()["username"], r.json()["role"]) == (
            me["id"],
            "Sita",
            "player",
        )
        assert (mailer.outbox[-1].to, mailer.outbox[-1].subject) == (
            "sita@example.com",
            "Confirm your new ClawPlay email address",
        )
        token = last_token(mailer)
        r = await http.post(CLAIM, json=claim)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "not_a_guest")
        games = (await http.get("/api/v1/players/Sita/games")).json()
        assert [g["id"] for g in games] == [game["id"]]

        r = await http.post("/api/v1/auth/confirm-email", json={"token": token})
        assert r.json() == {"email": "sita@example.com"}

    # The username and password work at once, on any device.
    async with _browser(app) as phone:
        r = await phone.post("/api/v1/auth/login", json={"login": "sita", "password": PASSWORD})
        assert r.status_code == 200, r.text


@pytest.mark.parametrize(
    ("username", "password", "code"),
    [
        ("guest-123abc", PASSWORD, "username_unavailable"),
        ("bob", PASSWORD, "username_taken"),
        ("Pass1234word", "pass1234word", "weak_password"),
    ],
)
async def test_what_a_guest_cannot_claim(
    app: FastAPI, players: PlayerFactory, username: str, password: str, code: str
) -> None:
    await players("bob")
    async with _browser(app) as http:
        await _guest(http)
        r = await http.post(
            CLAIM,
            json={**AGREE, "username": username, "email": "x@example.com", "password": password},
        )
        assert r.json()["error"]["code"] == code
        assert (await http.get("/api/v1/me")).json()["role"] == "guest"


async def test_registering_a_guest_name(app: FastAPI) -> None:
    async with _browser(app) as http:
        r = await http.post(
            "/api/v1/auth/register",
            json={**AGREE, "username": "guest-1", "email": "g@example.com", "password": PASSWORD},
        )
        assert r.json()["error"]["code"] == "username_unavailable"


async def test_names_run_out(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(secrets, "token_hex", lambda _: "abcdef")
    async with _browser(app) as http:
        await _guest(http)
    async with _browser(app) as http:
        r = await http.post(
            GUEST,
            json={
                **AGREE,
            },
        )
        assert (r.status_code, r.json()["error"]["code"]) == (503, "try_again")


async def _active(app: FastAPI, user_id: str) -> bool:
    async with app.state.ctx.sessions() as db:
        user = await db.get(User, uuid.UUID(user_id))
        assert user is not None
        return user.is_active


async def test_signing_out_deletes_a_guest_account(app: FastAPI) -> None:
    async with _browser(app) as http:
        me = await _guest(http)
        assert (await http.post("/api/v1/auth/logout")).status_code == 204
    assert not await _active(app, me["id"])


async def test_a_guest_in_a_live_game_is_deleted_later(app: FastAPI) -> None:
    state = app.state.ctx

    async def tidy() -> int:
        async with state.sessions() as db:
            done = await housekeeping.tidy(db, state.settings, state.clock())
        return done["guest_accounts"]

    async with _browser(app) as http:
        me = await _guest(http)
        game = (await http.post("/api/v1/games/computer", json={"level": "easy"})).json()
        assert (await http.post("/api/v1/auth/logout")).status_code == 204
    assert await _active(app, me["id"])  # the live game keeps it for now
    assert await tidy() == 0
    async with state.sessions() as db:  # the game ends
        gid = uuid.UUID(game["id"])
        await db.execute(update(Game).where(Game.id == gid).values(status=GameStatus.FINISHED))
        await db.execute(delete(ActiveGame).where(ActiveGame.game_id == gid))
        await db.commit()
    assert await tidy() == 1
    assert not await _active(app, me["id"])
