"""The sand clock: one minute each, and the time a player takes goes to the opponent."""

from contextlib import AsyncExitStack

from fastapi import FastAPI

from baghchal_server.lobby.time_controls import Category, category_of, label_of

from .conftest import Clock, PlayerFactory
from .test_games import _online, _play, _start


async def test_time_taken_goes_to_the_opponent(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "sand")
        assert (game["time_control"], game["clocks"]["goat_ms"]) == ("sand", 60_000)
        # First moves are free here too.
        game = await _play(alice, bob, game, ["c3", "a1-b2"])
        assert game["clocks"] == {"goat_ms": 60_000, "tiger_ms": 60_000, "running": "goat"}

        # While the goats think, their sand runs to the tigers.
        clock.advance(seconds=10)
        mid = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert mid["clocks"] == {"goat_ms": 50_000, "tiger_ms": 70_000, "running": "goat"}
        game = await _play(alice, bob, game, ["c2"])
        assert game["clocks"] == {"goat_ms": 50_000, "tiger_ms": 70_000, "running": "tiger"}
        assert game["deadline_at"].startswith("2026-01-01T12:01:20")  # 12:00:10 + 70 s

        clock.advance(seconds=25)
        game = await _play(alice, bob, game, ["b2-b1"])
        assert game["clocks"] == {"goat_ms": 75_000, "tiger_ms": 45_000, "running": "goat"}

        # Run out, and the other side has all the sand: two minutes.
        clock.advance(seconds=75)
        game = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert game["result"] == {"winner": "tiger", "reason": "timeout"}
        assert (game["clocks"]["goat_ms"], game["clocks"]["tiger_ms"]) == (0, 120_000)


async def test_a_rating_of_its_own(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "sand", "rated": True}
        )
        accepted = (await bob.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")).json()
    await alice.http.post(f"/api/v1/games/{accepted['game_id']}/resign")
    ratings = (await alice.http.get("/api/v1/players/alice")).json()["ratings"]
    assert (ratings["sand"]["games"], ratings["blitz"]["games"], ratings["rapid"]["games"]) == (
        1,
        0,
        0,
    )
    assert (await alice.http.get("/api/v1/leaderboards/sand")).status_code == 200


def test_retired_time_controls_still_count() -> None:
    # 10+5 and 15+10 are no longer offered, but games made with them finish as Standard.
    assert (label_of(600, 5), category_of(600, 5)) == ("10+5", Category.RAPID)
    assert (label_of(900, 10), category_of(900, 10)) == ("15+10", Category.RAPID)
    assert (label_of(60, 0), category_of(60, 0)) == ("sand", Category.SAND)


async def test_only_offered_time_controls_can_be_chosen(players: PlayerFactory) -> None:
    alice, _ = await players("alice"), await players("bob")
    for tc in ("10+5", "15+10", "1+0"):
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": tc}
        )
        assert r.status_code == 422, tc
