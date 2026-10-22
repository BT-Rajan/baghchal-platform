import asyncio
import uuid
from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx_ws import AsyncWebSocketSession
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from baghchal_server.accounts.models import User
from baghchal_server.games import service as game_service
from baghchal_server.lobby import service as lobby_service
from baghchal_server.mail import MemoryMailer

from .conftest import AGREE, PASSWORD, Clock, Player, PlayerFactory, open_socket

CHALLENGES = "/api/v1/challenges"


async def _event(ws: AsyncWebSocketSession) -> dict[str, Any]:
    """The next message, skipping round-trip probes (a client may leave them unanswered) and
    notification nudges (tested in test_notifications)."""
    while True:
        message: dict[str, Any] = await asyncio.wait_for(ws.receive_json(), timeout=2)
        if message["type"] not in {"probe", "notification"}:
            return message


async def _online(
    app: FastAPI, stack: AsyncExitStack, *people: Player
) -> list[AsyncWebSocketSession]:
    """Connect each player's socket and consume the hello message."""
    sockets = []
    for p in people:
        ws = await stack.enter_async_context(open_socket(app, p.auth))
        assert (await _event(ws))["type"] == "hello"
        sockets.append(ws)
    return sockets


async def _challenge(challenger: Player, opponent: Player, **extra: object) -> httpx.Response:
    return await challenger.http.post(
        CHALLENGES, json={"opponent": opponent.username, "time_control": "5+3", **extra}
    )


# ── Players ───────────────────────────────────────────────────────────────


async def test_lobby_requires_sign_in(app_client: httpx.AsyncClient) -> None:
    for path in ("/api/v1/players?prefix=a", "/api/v1/players/online", CHALLENGES):
        assert (await app_client.get(path)).status_code == 401


async def test_player_search(
    players: PlayerFactory, app_client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    me = await players("Alice")
    await players("al_ex")
    await players("alberto")
    await players("bob")
    # Accounts not yet confirmed are listed too: they play.
    await app_client.post(
        "/api/v1/auth/register",
        json={**AGREE, "username": "alpha", "email": "alpha@example.com", "password": PASSWORD},
    )

    r = await me.http.get("/api/v1/players", params={"prefix": "AL"})
    assert r.status_code == 200
    assert [p["username"] for p in r.json()] == ["al_ex", "alberto", "Alice", "alpha"]
    assert all(p["online"] is False for p in r.json())

    # "_" matches only itself, not any character.
    r = await me.http.get("/api/v1/players", params={"prefix": "al_"})
    assert [p["username"] for p in r.json()] == ["al_ex"]

    r = await me.http.get("/api/v1/players", params={"prefix": "a", "limit": 1})
    assert len(r.json()) == 1


@pytest.mark.parametrize("prefix", ["", "a%", "a b", "x" * 21])
async def test_player_search_rejects_bad_prefixes(players: PlayerFactory, prefix: str) -> None:
    me = await players("alice")
    r = await me.http.get("/api/v1/players", params={"prefix": prefix})
    assert r.status_code == 422


async def test_online_list_and_profile_follow_connections(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    r = await alice.http.get("/api/v1/players/bob")
    assert r.json()["online"] is False
    assert (await alice.http.get("/api/v1/players/online")).json() == []

    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        r = await alice.http.get("/api/v1/players/BOB")
        assert r.json()["online"] is True
        assert r.json()["username"] == "bob"
        online = (await alice.http.get("/api/v1/players/online")).json()
        assert online == [
            {"id": bob.id, "username": "bob", "badge": None, "online": True, "playing": False}
        ]

    assert (await alice.http.get("/api/v1/players/bob")).json()["online"] is False
    assert (await alice.http.get("/api/v1/players/nobody")).status_code == 404


async def test_disabled_players_disappear_from_the_lobby(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        async with app.state.ctx.sessions() as db:
            await db.execute(update(User).where(User.username == "bob").values(is_active=False))
            await db.commit()
        assert (await alice.http.get("/api/v1/players/online")).json() == []
        assert (await alice.http.get("/api/v1/players/bob")).status_code == 404
        assert (await alice.http.get("/api/v1/players", params={"prefix": "b"})).json() == []


# ── Challenges ────────────────────────────────────────────────────────────


async def test_challenge_lifecycle(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        alice_ws, bob_ws = await _online(app, stack, alice, bob)

        r = await _challenge(alice, bob)
        assert r.status_code == 201
        created = r.json()
        assert created["status"] == "pending"
        assert created["side"] == "random"
        assert created["rated"] is False
        assert created["time_control"] == "5+3"
        assert created["challenger"] == {"id": alice.id, "username": "alice", "badge": None}

        # Both players hear about it, on every connection.
        for ws in (alice_ws, bob_ws):
            event = await _event(ws)
            assert event == {"type": "challenge", "challenge": created}

        listing = (await bob.http.get(CHALLENGES)).json()
        assert [c["id"] for c in listing["incoming"]] == [created["id"]]
        assert listing["outgoing"] == []
        assert [c["id"] for c in (await alice.http.get(CHALLENGES)).json()["outgoing"]] == [
            created["id"]
        ]

        r = await bob.http.post(f"{CHALLENGES}/{created['id']}/accept")
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"
        for ws in (alice_ws, bob_ws):
            assert (await _event(ws))["challenge"]["status"] == "accepted"

        assert (await bob.http.get(CHALLENGES)).json() == {"incoming": [], "outgoing": []}


@pytest.mark.parametrize(
    ("actor", "action", "status", "code"),
    [
        ("opponent", "decline", 200, "declined"),
        ("challenger", "cancel", 200, "cancelled"),
        ("challenger", "accept", 403, "not_allowed"),
        ("challenger", "decline", 403, "not_allowed"),
        ("opponent", "cancel", 403, "not_allowed"),
        ("outsider", "accept", 404, "challenge_not_found"),
    ],
)
async def test_who_may_respond(  # noqa: PLR0917 - parametrized
    app: FastAPI, players: PlayerFactory, actor: str, action: str, status: int, code: str
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    who = {"challenger": alice, "opponent": bob, "outsider": carol}[actor]
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        challenge_id = (await _challenge(alice, bob)).json()["id"]
    r = await who.http.post(f"{CHALLENGES}/{challenge_id}/{action}")
    assert r.status_code == status
    if status == 200:
        assert r.json()["status"] == code
    else:
        assert r.json()["error"]["code"] == code


async def test_unknown_challenge(players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.post(f"{CHALLENGES}/00000000-0000-0000-0000-000000000000/accept")
    assert r.status_code == 404
    assert (await alice.http.post(f"{CHALLENGES}/not-a-uuid/accept")).status_code == 422


async def test_a_challenge_can_be_answered_only_once(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        challenge_id = (await _challenge(alice, bob)).json()["id"]
    # Two simultaneous answers: exactly one wins.
    results = await asyncio.gather(
        bob.http.post(f"{CHALLENGES}/{challenge_id}/accept"),
        bob.http.post(f"{CHALLENGES}/{challenge_id}/decline"),
        alice.http.post(f"{CHALLENGES}/{challenge_id}/cancel"),
    )
    assert sorted(r.status_code for r in results) == [200, 409, 409]
    assert all(
        r.json()["error"]["code"] == "challenge_closed" for r in results if r.status_code == 409
    )


async def test_challenges_expire(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        challenge_id = (await _challenge(alice, bob)).json()["id"]
        clock.advance(seconds=60)
        assert (await bob.http.get(CHALLENGES)).json()["incoming"] == []
        r = await bob.http.post(f"{CHALLENGES}/{challenge_id}/accept")
        assert r.status_code == 409
        # The lapsed challenge no longer blocks a new one, in either direction.
        assert (await _challenge(bob, alice)).status_code == 201


async def test_one_open_challenge_per_pair(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        assert (await _challenge(alice, bob)).status_code == 201
        r = await _challenge(alice, bob)
        assert r.status_code == 409
        assert r.json()["error"] == {
            "code": "challenge_exists",
            "message": "You have already challenged bob. Wait for their answer.",
        }
        # Bob challenging back is told that a challenge is waiting for him.
        r = await _challenge(bob, alice)
        assert r.status_code == 409
        assert r.json()["error"] == {
            "code": "challenge_incoming",
            "message": "alice has already challenged you. Accept their challenge instead.",
        }


async def test_limit_on_open_outgoing_challenges(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    others = [await players(f"player{i}") for i in range(6)]
    async with AsyncExitStack() as stack:
        await _online(app, stack, *others)
        for other in others[:5]:
            assert (await _challenge(alice, other)).status_code == 201
        r = await _challenge(alice, others[5])
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "too_many_challenges"


@pytest.mark.parametrize(
    ("body", "status", "code"),
    [
        ({"opponent": "nobody", "time_control": "5+3"}, 404, "player_not_found"),
        ({"opponent": "alice", "time_control": "5+3"}, 422, "cannot_challenge_self"),
        ({"opponent": "bob", "time_control": "1+0"}, 422, "invalid_request"),
        (
            {"opponent": "bob", "time_control": "5+3", "rated": True, "side": "goat"},
            422,
            "invalid_request",
        ),
        ({"opponent": "bob", "time_control": "5+3", "side": "lion"}, 422, "invalid_request"),
        ({"opponent": "bob", "time_control": "5+3", "extra": 1}, 422, "invalid_request"),
    ],
)
async def test_invalid_challenges(
    app: FastAPI, players: PlayerFactory, body: dict[str, object], status: int, code: str
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        r = await alice.http.post(CHALLENGES, json=body)
        assert r.status_code == status
        assert r.json()["error"]["code"] == code


async def test_offline_players_cannot_be_challenged(players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    r = await _challenge(alice, bob)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "player_offline"


async def test_rated_and_side_options(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob, carol)
        rated = (await _challenge(alice, bob, rated=True)).json()
        assert (rated["rated"], rated["side"]) == (True, None)
        casual = (await _challenge(alice, carol, side="tiger", time_control="3+2")).json()
        assert (casual["rated"], casual["side"], casual["time_control"]) == (
            False,
            "tiger",
            "3+2",
        )


async def test_challenge_rate_limit(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        for _ in range(15):  # 15 create + 15 cancel = 30 requests, 15 of them creates
            challenge_id = (await _challenge(alice, bob)).json()["id"]
            await alice.http.post(f"{CHALLENGES}/{challenge_id}/cancel")
        for _ in range(15):
            challenge_id = (await _challenge(alice, bob)).json()["id"]
            await alice.http.post(f"{CHALLENGES}/{challenge_id}/cancel")
        r = await _challenge(alice, bob)
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "rate_limited"


async def test_unexpected_integrity_errors_are_not_reported_as_busy(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        challenge_id = (await _challenge(alice, bob)).json()["id"]

    async def broken(*args: object) -> None:
        raise IntegrityError("INSERT", {}, Exception("some other constraint"))

    monkeypatch.setattr(game_service, "start_game", broken)
    state = app.state.ctx
    async with state.sessions() as db:
        with pytest.raises(IntegrityError):
            await lobby_service.respond(
                db, state.clock(), uuid.UUID(bob.id), uuid.UUID(challenge_id), "accept"
            )
