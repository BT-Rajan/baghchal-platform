"""Quick pairing: seeks."""

import uuid
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any

import pytest
from fastapi import FastAPI

from baghchal_server.deps import AppState
from baghchal_server.lobby import seeks
from baghchal_server.lobby.models import Seek

from .conftest import Clock, Player, PlayerFactory
from .test_fair_play import _aborted_game
from .test_games import _event, _online, _start

SEEKS = "/api/v1/seeks"


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


async def _seek(player: Player, time_control: str = "5+3", **body: Any) -> Any:
    r = await player.http.post(SEEKS, json={"time_control": time_control, **body})
    assert r.status_code == 200, r.text
    return r.json()


async def test_the_second_player_is_paired_with_the_first(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        alice_ws, _ = await _online(app, stack, alice, bob)
        waiting = await _seek(alice)
        assert (waiting["status"], waiting["game"]) == ("waiting", None)
        assert waiting["expires_at"] is not None
        assert (await bob.http.get(SEEKS)).json() == [
            {"time_control": "5+3", "rated": False, "players": 1}
        ]
        paired = await _seek(bob)
        assert paired["status"] == "paired"
        game = paired["game"]
        assert {game["goat"]["username"], game["tiger"]["username"]} == {"alice", "bob"}
        assert (game["time_control"], game["rated"], game["match"]) == ("5+3", False, None)
        # Alice, who was waiting, hears of it on her socket.
        assert (await _event(alice_ws, "game"))["game"]["id"] == game["id"]
    assert (await bob.http.get(SEEKS)).json() == []


async def test_only_the_same_kind_of_game_pairs(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        await _seek(alice, "5+3")
        assert (await _seek(bob, "5+3", rated=True))["status"] == "waiting"
        assert (await _seek(carol, "2+1"))["status"] == "waiting"
        assert (await alice.http.get(SEEKS)).json() == [
            {"time_control": "2+1", "rated": False, "players": 1},
            {"time_control": "5+3", "rated": False, "players": 1},
            {"time_control": "5+3", "rated": True, "players": 1},
        ]


async def test_rated_pairing_is_a_match_and_once_a_day(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        await _seek(alice, rated=True)
        game = (await _seek(bob, rated=True))["game"]
        assert game["match"] is not None
        loser = alice if game["goat"]["username"] == "alice" else bob
        await loser.http.post(f"/api/v1/games/{game['id']}/resign")
        second = (await loser.http.get("/api/v1/games")).json()[0]
        await loser.http.post(f"/api/v1/games/{second['id']}/resign")
        await _seek(alice, rated=True)
        assert (await _seek(bob, rated=True))["status"] == "waiting"  # already played today
        assert (await _seek(alice, "5+3"))["status"] == "waiting"  # replaced her rated seek
        assert (await _seek(bob, "5+3"))["status"] == "paired"  # casual is fine


async def test_who_is_passed_over(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice, bob = await players("alice"), await players("bob")
    carol, dave = await players("carol"), await players("dave")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob, carol, dave)  # alice is not online
        await _seek(alice)
        await dave.http.put("/api/v1/blocks/bob")
        clock.advance(seconds=1)
        assert (await _seek(bob))["status"] == "waiting"  # alice is offline
        clock.advance(seconds=1)
        assert (await _seek(dave))["status"] == "waiting"  # alice offline, bob blocked
        clock.advance(seconds=1)
        game = (await _seek(carol))["game"]  # bob has waited longest of those left
        assert {game["goat"]["username"], game["tiger"]["username"]} == {"bob", "carol"}


async def test_busy_players(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        await _seek(alice)
        await _start(alice, bob)  # alice starts a game meanwhile
        assert (await _seek(carol))["status"] == "waiting"  # alice is passed over
        r = await bob.http.post(SEEKS, json={"time_control": "5+3"})
        assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")


async def test_the_abort_penalty_applies(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        await _seek(carol)
        for _ in range(3):
            await _aborted_game(carol, bob)
        assert (await _seek(alice))["status"] == "waiting"  # carol is passed over
        r = await carol.http.post(SEEKS, json={"time_control": "5+3"})
        assert (r.status_code, r.json()["error"]["code"]) == (429, "abort_cooldown")


async def test_a_wait_lapses_and_can_be_cancelled(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        await _seek(alice)
        clock.advance(minutes=2, seconds=1)
        assert (await alice.http.get(SEEKS)).json() == []
        assert (await _seek(bob))["status"] == "waiting"
        assert (await alice.http.delete(SEEKS)).status_code == 204  # nothing to cancel: fine
        assert (await bob.http.delete(SEEKS)).status_code == 204
        assert (await alice.http.get(SEEKS)).json() == []
    assert (await alice.http.post(SEEKS, json={"time_control": "1+0"})).status_code == 422


async def test_races(
    app: FastAPI, players: PlayerFactory, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    state = _state(app)
    a, b = uuid.UUID(alice.id), uuid.UUID(bob.id)
    async with state.sessions() as db:
        # Someone else claimed the partner first: nothing to claim.
        assert (
            await seeks._pair(
                db, clock(), a, b, initial_seconds=300, increment_seconds=3, rated=False
            )
            is None
        )
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        await _start(alice, bob)
    async with state.sessions() as db:
        db.add(
            Seek(
                user_id=a,
                initial_seconds=300,
                increment_seconds=3,
                rated=False,
                created_at=clock(),
                expires_at=clock() + timedelta(minutes=1),
            )
        )
        await db.commit()
        # The claim works, but both are playing by now: no game, nothing changed.
        assert (
            await seeks._pair(
                db, clock(), a, b, initial_seconds=300, increment_seconds=3, rated=False
            )
            is None
        )

    # The same player asking twice at once: the second insert finds the first.
    carol = await players("carol")
    original = seeks.hidden_from  # type: ignore[attr-defined]

    async def meanwhile(db: Any, viewer: uuid.UUID) -> set[uuid.UUID]:
        async with state.sessions() as other:
            other.add(
                Seek(
                    user_id=viewer,
                    initial_seconds=120,
                    increment_seconds=1,
                    rated=False,
                    created_at=clock(),
                    expires_at=clock() + timedelta(minutes=2),
                )
            )
            await other.commit()
        return await original(db, viewer)

    monkeypatch.setattr(seeks, "hidden_from", meanwhile)
    assert (await _seek(carol, "2+1"))["status"] == "waiting"
    monkeypatch.undo()
    waiting = (await carol.http.get(SEEKS)).json()
    assert {"time_control": "2+1", "rated": False, "players": 1} in waiting  # just one


async def test_a_lost_race_moves_on_to_the_next_player(
    app: FastAPI, players: PlayerFactory, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    state = _state(app)
    async with state.sessions() as db:  # alice, then bob, waiting for 5+3
        for i, p in enumerate((alice, bob)):
            db.add(
                Seek(
                    user_id=uuid.UUID(p.id),
                    initial_seconds=300,
                    increment_seconds=3,
                    rated=False,
                    created_at=clock() + timedelta(seconds=i),
                    expires_at=clock() + timedelta(minutes=2),
                )
            )
        await db.commit()
    real = seeks._pair
    tried: list[uuid.UUID] = []

    async def first_one_taken(*args: Any, **kwargs: Any) -> Any:
        tried.append(args[2])
        if len(tried) == 1:
            return None  # another request claimed alice a moment earlier
        return await real(*args, **kwargs)

    monkeypatch.setattr(seeks, "_pair", first_one_taken)
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        game = (await _seek(carol))["game"]
    assert tried == [uuid.UUID(alice.id), uuid.UUID(bob.id)]
    assert {game["goat"]["username"], game["tiger"]["username"]} == {"bob", "carol"}
