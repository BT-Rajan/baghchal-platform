"""Abort penalties, lag compensation and blocking."""

import asyncio
import time
import uuid
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from baghchal_server.deps import AppState
from baghchal_server.games import service as game_service
from baghchal_server.lobby import service as lobby_service
from baghchal_server.realtime import presence as presence_module
from baghchal_server.realtime import ws as ws_module
from baghchal_server.realtime.presence import MemoryPresence

from .conftest import Clock, Player, PlayerFactory, open_socket
from .test_games import _event, _move, _online, _play, _start

CHALLENGES = "/api/v1/challenges"


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


async def _challenge(challenger: Player, opponent: Player, **options: object) -> httpx.Response:
    return await challenger.http.post(
        CHALLENGES, json={"opponent": opponent.username, "time_control": "5+3", **options}
    )


# ── Abort penalties ───────────────────────────────────────────────────────


async def _aborted_game(alice: Player, bob: Player) -> None:
    """Alice (goats) challenges Bob, Bob accepts, Alice aborts."""
    game = await _start(alice, bob)
    r = await alice.http.post(f"/api/v1/games/{game['id']}/abort")
    assert r.json()["result"]["reason"] == "aborted"


async def test_three_aborts_in_a_day_mean_a_break(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        await _aborted_game(alice, bob)
        await _aborted_game(alice, bob)
        # Not making a first move counts too: alice (goats) lets the 30 s run out.
        game = await _start(alice, bob)
        clock.advance(seconds=31)
        r = await alice.http.get(f"/api/v1/games/{game['id']}")
        assert r.json()["result"] == {"winner": None, "reason": "aborted"}

        r = await _challenge(alice, bob)
        assert r.status_code == 429
        assert r.json()["error"] == {
            "code": "abort_cooldown",
            "message": "You have aborted 3 games in the last 24 hours (not making a first move "
            "counts too). You can start new games again in 60 minutes.",
        }
        assert r.headers["retry-after"] == "3600"
        # Nor can alice accept a challenge; bob, who aborted nothing, is not held back.
        challenge_id = (await _challenge(bob, alice)).json()["id"]
        r = await alice.http.post(f"{CHALLENGES}/{challenge_id}/accept")
        assert r.json()["error"]["code"] == "abort_cooldown"
        assert (await alice.http.post(f"{CHALLENGES}/{challenge_id}/decline")).status_code == 200
        r = await _challenge(bob, carol)
        assert r.status_code == 201
        await carol.http.post(f"{CHALLENGES}/{r.json()['id']}/decline")

        clock.advance(minutes=59)
        r = await _challenge(alice, bob)
        assert r.json()["error"]["message"].endswith("in 1 minute.")
        clock.advance(minutes=1)
        r = await _challenge(alice, bob)
        assert r.status_code == 201
        await bob.http.post(f"{CHALLENGES}/{r.json()['id']}/decline")


async def test_the_side_that_does_not_move_caused_the_abort(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    """Goats move first; once they have, a tiger who does not move is the one to blame."""
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        for _ in range(3):
            game = await _start(alice, bob)
            await _move(alice, game, "c3")  # alice moved; bob (tigers) never does
            clock.advance(seconds=31)
            await alice.http.get(f"/api/v1/games/{game['id']}")
            clock.advance(minutes=5)
        assert (await _challenge(bob, alice)).json()["error"]["code"] == "abort_cooldown"
        r = await _challenge(alice, bob)
        assert r.status_code == 201


async def test_old_aborts_do_not_count(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        await _aborted_game(alice, bob)
        await _aborted_game(alice, bob)
        clock.advance(hours=25)
        await _aborted_game(alice, bob)
        r = await _challenge(alice, bob)
        assert r.status_code == 201  # only one abort in the last day


# ── Lag compensation ──────────────────────────────────────────────────────


async def test_the_server_measures_the_round_trip(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(presence_module, "HEARTBEAT", 0.25)  # longer than the slow echo below
    alice = await players("alice")
    alice_id = uuid.UUID(alice.id)
    presence = _state(app).presence
    async with open_socket(app, alice.auth) as ws:
        assert (await ws.receive_json())["type"] == "hello"
        probe = await ws.receive_json()
        assert probe == {"type": "probe", "id": 1}  # right away, not after a heartbeat
        await ws.send_json({"type": "probe", "id": 99})  # not the one asked for: ignored
        await asyncio.sleep(0.02)
        assert await presence.round_trip_ms(alice_id) is None
        await ws.send_json(probe)
        await asyncio.sleep(0.02)
        first = await presence.round_trip_ms(alice_id)
        assert first is not None
        assert 0 <= first < 1000
        await ws.send_json(probe)  # echoed twice: the second counts for nothing
        # The next heartbeat probes again; the average moves towards the new sample.
        nxt = await ws.receive_json()
        while nxt["type"] != "probe":
            nxt = await ws.receive_json()
        assert nxt["id"] == 2
        await asyncio.sleep(0.1)  # a slower answer
        await ws.send_json(nxt)
        await asyncio.sleep(0.02)
        second = await presence.round_trip_ms(alice_id)
        assert second is not None
        assert first < second < 100  # smoothed, not the whole 100 ms


async def test_echoes_too_slow_to_be_the_network_are_ignored(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ws_module, "MAX_ROUND_TRIP_MS", 0.0)
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        await ws.receive_json()
        await ws.send_json(await ws.receive_json())
        await asyncio.sleep(0.02)
        assert await _state(app).presence.round_trip_ms(uuid.UUID(alice.id)) is None


async def _clocks_game(app: FastAPI, alice: Player, bob: Player) -> dict[str, Any]:
    """A 5+3 game where alice (goats) is to move with the clocks running (ply 2)."""
    game = await _start(alice, bob)
    return await _play(alice, bob, game, ["c3", "a1-b2"])


@pytest.mark.parametrize(("round_trip", "allowed"), [(300, 300), (2_000, 500), (None, 0)])
async def test_network_delay_is_not_charged(
    app: FastAPI,
    players: PlayerFactory,
    clock: Clock,
    round_trip: int | None,
    allowed: int,
) -> None:
    """Up to 0.5 s of the mover's measured round trip is not taken off their clock, and their
    deadline moves out by the same amount."""
    alice, bob = await players("alice"), await players("bob")
    if round_trip is not None:
        await _state(app).presence.record_round_trip(uuid.UUID(alice.id), round_trip)
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _clocks_game(app, alice, bob)
        assert game["side_to_move"] == "goat"
        turn_start = clock()
        deadline = turn_start + timedelta(milliseconds=300_000 + allowed)
        assert game["deadline_at"] == deadline.isoformat().replace("+00:00", "Z")
        clock.advance(seconds=10)
        r = await _move(alice, game, "c2")
        assert r.status_code == 200
        assert r.json()["clocks"]["goat_ms"] == 300_000 - (10_000 - allowed) + 3_000


async def test_the_allowance_never_makes_time_go_backwards(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _state(app).presence.record_round_trip(uuid.UUID(alice.id), 400)
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _clocks_game(app, alice, bob)
        clock.advance(seconds=0.1)  # a move faster than the allowance costs nothing
        r = await _move(alice, game, "c2")
        assert r.json()["clocks"]["goat_ms"] == 300_000 + 3_000


async def test_a_move_inside_the_allowance_beats_the_flag(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _state(app).presence.record_round_trip(uuid.UUID(alice.id), 400)
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _clocks_game(app, alice, bob)
        clock.advance(seconds=300.3)  # past the clock, inside the allowance
        r = await _move(alice, game, "c2")
        assert r.status_code == 200
        assert r.json()["clocks"]["goat_ms"] == 100 + 3_000  # 300.3 s less 0.4 s, plus 3 s


async def test_memory_round_trips_lapse(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 1_000_000.0
    monkeypatch.setattr(time, "time", lambda: now)
    presence = MemoryPresence()
    user = uuid.uuid4()
    assert await presence.round_trip_ms(user) is None
    await presence.record_round_trip(user, 120)
    assert await presence.round_trip_ms(user) == 120
    now += presence_module.ROUND_TRIP_TTL + 1
    assert await presence.round_trip_ms(user) is None


# ── Blocking ──────────────────────────────────────────────────────────────


async def test_blocking_a_player(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        sockets = await _online(app, stack, alice, bob, carol)
        alice_ws, bob_ws = sockets[0], sockets[1]
        pending = (await _challenge(bob, alice)).json()
        await _event(alice_ws, "challenge")
        await _event(bob_ws, "challenge")

        assert (await alice.http.put("/api/v1/blocks/bob")).status_code == 204
        assert (await alice.http.put("/api/v1/blocks/bob")).status_code == 204  # again: fine
        # The open challenge is closed, and both players are told.
        for ws in (alice_ws, bob_ws):
            closed = (await _event(ws, "challenge"))["challenge"]
            assert (closed["id"], closed["status"]) == (pending["id"], "declined")

        assert (await alice.http.get("/api/v1/blocks")).json() == [
            {"id": bob.id, "username": "bob", "badge": None}
        ]
        assert (await alice.http.get("/api/v1/players/bob")).json()["blocked"] is True
        assert (await bob.http.get("/api/v1/players/alice")).json()["blocked"] is False
        # Neither sees the other in the lobby's lists; others are unaffected.
        for viewer, hidden in ((alice, "bob"), (bob, "alice")):
            online = {
                p["username"] for p in (await viewer.http.get("/api/v1/players/online")).json()
            }
            assert hidden not in online
            assert "carol" in online
            found = (await viewer.http.get("/api/v1/players", params={"prefix": hidden})).json()
            assert found == []
        carol_sees = {
            p["username"] for p in (await carol.http.get("/api/v1/players/online")).json()
        }
        assert {"alice", "bob"} <= carol_sees
        # Neither can challenge the other.
        r = await _challenge(alice, bob)
        assert r.status_code == 403
        assert r.json()["error"] == {
            "code": "player_blocked",
            "message": "You have blocked bob. Unblock them to challenge them.",
        }
        r = await _challenge(bob, alice)
        assert r.json()["error"] == {
            "code": "challenge_refused",
            "message": "You cannot challenge alice.",
        }

        assert (await alice.http.delete("/api/v1/blocks/bob")).status_code == 204
        assert (await alice.http.get("/api/v1/blocks")).json() == []
        assert (await alice.http.get("/api/v1/players/bob")).json()["blocked"] is False
        assert (await _challenge(bob, alice)).status_code == 201


async def test_blocking_closes_my_own_open_challenge(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        mine = (await _challenge(alice, bob)).json()
        await alice.http.put("/api/v1/blocks/bob")
        assert (await alice.http.get(CHALLENGES)).json() == {"incoming": [], "outgoing": []}
        r = await bob.http.post(f"{CHALLENGES}/{mine['id']}/accept")
        assert r.json()["error"]["code"] == "challenge_closed"


async def test_block_requests_are_checked(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.put("/api/v1/blocks/alice")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "cannot_block_self"
    for method in ("put", "delete"):
        r = await getattr(alice.http, method)("/api/v1/blocks/nobody")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "player_not_found"


async def test_blocking_twice_at_once_is_fine(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    await players("bob")
    assert (await alice.http.put("/api/v1/blocks/bob")).status_code == 204

    async def not_yet(*_: object) -> bool:  # as if the other request had not committed yet
        return False

    monkeypatch.setattr(lobby_service, "has_blocked", not_yet)
    assert (await alice.http.put("/api/v1/blocks/bob")).status_code == 204
    monkeypatch.undo()
    assert len((await alice.http.get("/api/v1/blocks")).json()) == 1


async def test_cooldown_is_zero_without_aborts(app: FastAPI) -> None:
    async with _state(app).sessions() as db:
        assert await game_service.abort_cooldown(db, uuid.uuid4(), Clock()()) == timedelta(0)
