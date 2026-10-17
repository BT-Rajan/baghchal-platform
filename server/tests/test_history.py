"""Game history and replay positions."""

from contextlib import AsyncExitStack

from fastapi import FastAPI

from baghchal_engine import Game as EngineGame
from baghchal_engine import format_position, parse_move

from .conftest import Clock, PlayerFactory
from .test_games import FIVE_CAPTURES, _online, _play, _start

START = format_position(EngineGame().position)


async def test_a_finished_game_can_be_replayed(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        assert game["positions"] == []  # not while it is being played
        game = await _play(alice, bob, game, FIVE_CAPTURES[:6])
        assert game["positions"] == []
        await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    final = (await bob.http.get(f"/api/v1/games/{game['id']}")).json()
    positions = final["positions"]
    assert len(positions) == final["ply"] + 1 == 7
    assert positions[0] == START
    assert positions[-1] == final["position"]
    replay = EngineGame()
    for ply, move in enumerate(final["moves"], start=1):
        replay.play(parse_move(move))
        assert positions[ply] == format_position(replay.position)


async def test_a_players_history(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        first = await _start(alice, bob)  # alice goats
        await _play(alice, bob, first, FIVE_CAPTURES[:2])
        await alice.http.post(f"/api/v1/games/{first['id']}/resign")
        clock.advance(minutes=1)
        second = await _start(carol, alice)  # carol goats, alice tigers
        await alice.http.post(f"/api/v1/games/{second['id']}/abort")
        clock.advance(minutes=1)
        third = (
            await alice.http.post("/api/v1/games/computer", json={"level": "easy", "side": "goat"})
        ).json()
        await alice.http.post(f"/api/v1/games/{third['id']}/resign")

    history = (await bob.http.get("/api/v1/players/alice/games")).json()
    assert [g["id"] for g in history] == [third["id"], second["id"], first["id"]]
    newest, middle, oldest = history
    assert (newest["opponent"]["username"], newest["computer"], newest["outcome"]) == (
        "computer-easy",
        "easy",
        "lost",
    )
    assert (middle["side"], middle["outcome"], middle["result"]["reason"]) == (
        "tiger",
        "aborted",
        "aborted",
    )
    assert {k: oldest[k] for k in ("side", "outcome", "moves", "rating_change", "rated")} == {
        "side": "goat",
        "outcome": "lost",
        "moves": 2,
        "rating_change": None,
        "rated": False,
    }
    assert oldest["time_control"] == "5+3"
    bobs = (await alice.http.get("/api/v1/players/bob/games")).json()
    assert [(g["opponent"]["username"], g["outcome"]) for g in bobs] == [("alice", "won")]

    # Paging back in time.
    page = (await bob.http.get("/api/v1/players/alice/games", params={"limit": 2})).json()
    assert [g["id"] for g in page] == [third["id"], second["id"]]
    rest = (
        await bob.http.get(
            "/api/v1/players/alice/games", params={"before": page[-1]["finished_at"]}
        )
    ).json()
    assert [g["id"] for g in rest] == [first["id"]]


async def test_history_requests_are_checked(players: PlayerFactory) -> None:
    alice = await players("alice")
    assert (await alice.http.get("/api/v1/players/alice/games")).json() == []
    assert (await alice.http.get("/api/v1/players/nobody/games")).status_code == 404
    assert (await alice.http.get("/api/v1/players/computer-easy/games")).status_code == 404
    r = await alice.http.get("/api/v1/players/alice/games", params={"limit": 51})
    assert r.status_code == 422
