"""Achievements, worked out from games and daily puzzles."""

import uuid
from contextlib import AsyncExitStack
from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import update

from baghchal_server.achievements import service
from baghchal_server.deps import AppState
from baghchal_server.games.models import Game
from baghchal_server.trainer import service as trainer
from baghchal_server.trainer.models import Attempt
from baghchal_server.trainer.service import PUZZLES

from .conftest import Clock, Player, PlayerFactory
from .test_games import FIVE_CAPTURES, _online, _play, _start


async def _earned(viewer: Player, username: str) -> dict[str, Any]:
    r = await viewer.http.get(f"/api/v1/players/{username}/achievements")
    assert r.status_code == 200, r.text
    return {a["key"]: a["earned_at"] for a in r.json()}


async def _edit(app: FastAPI, game_id: str, **values: Any) -> None:
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        await db.execute(update(Game).where(Game.id == uuid.UUID(game_id)).values(**values))
        await db.commit()


async def test_from_games(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    assert set((await _earned(alice, "alice")).values()) == {None}
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        won = await _start(alice, bob)
        await bob.http.post(f"/api/v1/games/{won['id']}/resign")  # alice wins as goats
        captured = await _play(alice, bob, await _start(alice, bob), FIVE_CAPTURES)
    mine = await _earned(bob, "alice")  # anyone can see them
    assert mine["first_win"] is not None
    assert mine["goat_win"] == mine["first_win"]
    assert (mine["tiger_win"], mine["trapped"], mine["rated_10"]) == (None, None, None)
    bobs = await _earned(alice, "bob")
    assert bobs["tiger_win"] == bobs["five_captures"] == captured["finished_at"]

    # Rarer ends, the computer, and rated games.
    await _edit(app, won["id"], end_reason="tigers_trapped", bot_level="hard", rated=True)
    await _edit(app, captured["id"], rated=True, winner=None, end_reason="draw_agreed")
    monkeypatch.setattr(service, "RATED_GAMES", 2)
    mine = await _earned(alice, "alice")
    assert mine["trapped"] == mine["beat_hard"] == mine["first_win"]
    assert mine["beat_medium"] is None
    assert mine["rated_10"] == captured["finished_at"]


async def test_a_puzzle_streak(
    players: PlayerFactory, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(service, "PUZZLE_DAYS", 2)
    alice = await players("alice")
    for _ in range(2):
        puzzle = (await alice.http.get("/api/v1/trainer/daily")).json()["puzzle"]
        best = PUZZLES[puzzle["id"]].best
        await alice.http.post(f"/api/v1/trainer/{puzzle['id']}/answer", json={"move": best})
        clock.advance(days=1)
    assert (await _earned(alice, "alice"))["puzzle_streak_7"] == "2026-01-02T00:00:00Z"


def test_the_first_streak() -> None:
    def day(n: int, correct: bool = True) -> tuple[date, Attempt]:
        return date(2026, 1, n), Attempt(correct=correct)

    firsts = dict([day(1), day(2, correct=False), day(3), day(5), day(6), day(7)])
    assert trainer.first_streak(firsts, 3) == date(2026, 1, 7)  # a miss and a gap restart it
    assert trainer.first_streak(firsts, 4) is None


async def test_an_unknown_player(players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.get("/api/v1/players/nobody/achievements")
    assert (r.status_code, r.json()["error"]["code"]) == (404, "player_not_found")
