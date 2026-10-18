"""Post-game analysis: who may have it, how often, and only for finished games."""

import uuid
from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI

from baghchal_server.deps import AppState
from baghchal_server.games import analysis
from baghchal_server.games.computer import ComputerPlayers
from baghchal_server.games.models import Analysis

from .conftest import Clock, Player, PlayerFactory
from .test_billing import give_plan, make_admin
from .test_games import FIVE_CAPTURES, _online, _play, _start


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


def _url(game: dict[str, Any]) -> str:
    return f"/api/v1/games/{game['id']}/analysis"


async def _finished(app: FastAPI, alice: Player, bob: Player) -> dict[str, Any]:
    """A game the tigers (bob) win by taking five goats."""
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        return await _play(alice, bob, game, FIVE_CAPTURES)


async def _resigned(player: Player) -> dict[str, Any]:
    """A quick finished game: against the computer, resigned at once."""
    game = (await player.http.post("/api/v1/games/computer", json={"level": "easy"})).json()
    await player.http.post(f"/api/v1/games/{game['id']}/resign")
    return game  # type: ignore[no-any-return]


async def test_analysis_is_for_plus_and_finished_games(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    game = await _finished(app, alice, bob)
    r = await alice.http.post(_url(game))
    assert (r.status_code, r.json()["error"]["message"]) == (
        403,
        "Game analysis comes with ClawPlay Plus.",
    )
    assert (await alice.http.get(_url(game))).status_code == 403

    await give_plan(app, alice)
    r = await alice.http.get(_url(game))
    assert (r.status_code, r.json()["error"]["code"]) == (404, "not_analysed")
    r = await alice.http.post(_url(game))
    assert r.status_code == 200, r.text
    review = r.json()
    assert review["left_today"] == 4
    moves = review["moves"]
    assert [m["move"] for m in moves] == FIVE_CAPTURES
    assert [m["side"] for m in moves[:2]] == ["goat", "tiger"]
    assert all(m["verdict"] in {"best", "good", "inaccuracy", "mistake", "blunder"} for m in moves)
    assert moves[0]["verdict"] == "blunder"  # b2 hangs a goat at once
    assert moves[-1]["score"] == 5000  # the fifth capture wins

    # Reading it again, or asking again, costs nothing.
    again = (await alice.http.get(_url(game))).json()
    assert (again["moves"], again["left_today"]) == (moves, 4)
    assert (await alice.http.post(_url(game))).json()["left_today"] == 4

    # Bob, with Plus too, reads the same analysis without spending his allowance.
    await give_plan(app, bob)
    assert (await bob.http.post(_url(game))).json()["left_today"] == 5

    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        live = await _start(alice, bob)
    r = await alice.http.post(_url(live))
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_not_finished")
    r = await alice.http.post(f"/api/v1/games/{uuid.uuid4()}/analysis")
    assert r.status_code == 404


async def test_plus_has_five_a_day_and_pro_has_no_limit(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    await give_plan(app, alice)
    games = [await _resigned(alice) for _ in range(6)]
    for left, game in zip((4, 3, 2, 1, 0), games, strict=False):
        assert (await alice.http.post(_url(game))).json()["left_today"] == left
    r = await alice.http.post(_url(games[5]))
    assert (r.status_code, r.json()["error"]["code"]) == (429, "analysis_limit")

    clock.advance(days=1)  # a new day, a new allowance
    assert (await alice.http.post(_url(games[5]))).json()["left_today"] == 4

    bob = await players("bob")
    await give_plan(app, bob, "pro")
    assert (await bob.http.post(_url(await _resigned(bob)))).json()["left_today"] is None


async def test_the_feature_granted_alone_has_no_limit(app: FastAPI, players: PlayerFactory) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    r = await boss.http.post(
        "/api/v1/admin/players/alice/grants",
        json={"feature": "analysis", "days": None, "reason": "Coach"},
    )
    assert r.status_code == 201
    assert (await alice.http.post(_url(await _resigned(alice)))).json()["left_today"] is None


async def test_two_asking_at_once(
    app: FastAPI, players: PlayerFactory, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    await give_plan(app, alice)
    game = await _resigned(alice)
    state = _state(app)

    async def someone_else_first(moves: list[str]) -> list[dict[str, object]]:
        async with state.sessions() as other:
            other.add(Analysis(game_id=uuid.UUID(game["id"]), moves=[], created_at=clock()))
            await other.commit()
        return [{"ply": 1}]  # never stored: the other one wins

    async with state.sessions() as db:
        out = await analysis.analyse(
            db, uuid.UUID(alice.id), uuid.UUID(game["id"]), clock(), someone_else_first
        )
    assert (out.moves, out.left_today) == ([], 5)  # theirs, and hers was not counted


async def test_reviewing_in_a_separate_process() -> None:
    players = ComputerPlayers(workers=1)
    try:
        (first,) = await players.review(["c3"])
        assert (first["ply"], first["side"], first["move"]) == (1, "goat", "c3")
    finally:
        await players.stop()
