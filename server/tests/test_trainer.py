"""The trainer: opening and endgame puzzles, checked on the server."""

from typing import Any

import pytest
from fastapi import FastAPI

from baghchal_server.trainer import service
from baghchal_server.trainer.schemas import Kind
from baghchal_server.trainer.service import PUZZLES, Puzzle

from .conftest import Clock, Player, PlayerFactory
from .test_billing import give_plan

URL = "/api/v1/trainer"


async def _next(player: Player, kind: str = "opening") -> Any:
    return (await player.http.get(URL, params={"kind": kind})).json()


async def _answer(player: Player, puzzle_id: str, move: str) -> Any:
    return await player.http.post(f"{URL}/{puzzle_id}/answer", json={"move": move})


def _wrong(puzzle: dict[str, Any]) -> str:
    moves: list[str] = puzzle["legal_moves"]
    return next(m for m in moves if m != PUZZLES[puzzle["id"]].best)


def test_the_puzzles_ship_with_the_server() -> None:
    assert sum(p.kind == Kind.OPENING for p in PUZZLES.values()) >= 50
    assert sum(p.kind == Kind.ENDGAME for p in PUZZLES.values()) >= 50


async def test_the_trainer_is_for_pro(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.get(URL)
    assert (r.status_code, r.json()["error"]["message"]) == (
        403,
        "The trainer comes with ClawPlay Pro.",
    )
    await give_plan(app, alice, "plus")
    assert (await _answer(alice, "o001", "c3")).status_code == 403


async def test_solving_puzzles(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice = await players("alice")
    await give_plan(app, alice, "pro")
    first = await _next(alice)
    puzzle = first["puzzle"]
    assert (first["kind"], first["solved"], first["streak"]) == ("opening", 0, 0)
    assert first["total"] == sum(p.kind == Kind.OPENING for p in PUZZLES.values())
    assert puzzle["side"] in {"goat", "tiger"}
    assert "best" not in puzzle  # the answer stays on the server
    assert PUZZLES[puzzle["id"]].best in puzzle["legal_moves"]

    # A miss: the best move is shown, and the puzzle comes back after another.
    r = await _answer(alice, puzzle["id"], _wrong(puzzle))
    missed = r.json()
    assert (missed["correct"], missed["best"], missed["streak"]) == (
        False,
        PUZZLES[puzzle["id"]].best,
        0,
    )
    clock.advance(seconds=1)
    second = (await _next(alice))["puzzle"]
    assert second["id"] != puzzle["id"]
    clock.advance(seconds=1)
    got = (await _answer(alice, second["id"], PUZZLES[second["id"]].best)).json()
    assert (got["correct"], got["solved"], got["streak"]) == (True, 1, 1)
    clock.advance(seconds=1)
    assert (await _next(alice))["puzzle"]["id"] == puzzle["id"]
    got = (await _answer(alice, puzzle["id"], PUZZLES[puzzle["id"]].best)).json()
    assert (got["solved"], got["streak"]) == (2, 2)

    # Endgames are counted apart; the streak carries over.
    end = await _next(alice, "endgame")
    assert (end["kind"], end["solved"], end["streak"]) == ("endgame", 0, 2)
    assert end["puzzle"]["id"].startswith("e")


async def test_answers_must_be_legal(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    await give_plan(app, alice, "pro")
    puzzle = (await _next(alice))["puzzle"]
    for move in ("zz9", "a1-a1"):
        r = await _answer(alice, puzzle["id"], move)
        assert (r.status_code, r.json()["error"]["code"]) == (400, "illegal_move")
    assert (await _answer(alice, "o999", "c3")).status_code == 404
    assert (await _answer(alice, "BAD!", "c3")).status_code == 422
    assert (await alice.http.get(URL, params={"kind": "middle"})).status_code == 422


async def test_every_puzzle_solved(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    await give_plan(app, alice, "pro")
    few = {
        "o001": Puzzle("o001", Kind.OPENING, "T3T/5/5/5/T3T g 20 0", "c3"),
        "e001": Puzzle("e001", Kind.ENDGAME, PUZZLES["e004"].position, PUZZLES["e004"].best),
    }
    monkeypatch.setattr(service, "PUZZLES", few)
    only = await _next(alice)
    assert only["puzzle"]["id"] == "o001"
    await _answer(alice, "o001", "b2")  # a miss; with nothing else left it comes straight back
    assert (await _next(alice))["puzzle"]["id"] == "o001"
    await _answer(alice, "o001", "c3")
    done = await _next(alice)
    assert (done["puzzle"], done["solved"], done["total"]) == (None, 1, 1)


async def test_the_daily_puzzle_is_for_everyone(players: PlayerFactory, clock: Clock) -> None:
    alice, bob = await players("alice"), await players("bob")
    today = (await alice.http.get(f"{URL}/daily")).json()
    puzzle = today["puzzle"]
    assert (today["date"], today["answer"]) == ("2026-01-01", None)
    assert "best" not in puzzle
    # The same puzzle for everyone today.
    assert (await bob.http.get(f"{URL}/daily")).json()["puzzle"] == puzzle

    # Free players answer it like any trainer puzzle; the first answer is the one kept.
    r = await _answer(alice, puzzle["id"], _wrong(puzzle))
    assert (r.status_code, r.json()["correct"]) == (200, False)
    best = PUZZLES[puzzle["id"]].best
    assert (await _answer(alice, puzzle["id"], best)).json()["correct"] is True
    assert (await alice.http.get(f"{URL}/daily")).json()["answer"] == {
        "move": _wrong(puzzle),
        "correct": False,
        "best": best,
    }
    # The rest of the trainer is still Pro.
    other = next(p for p in PUZZLES if p != puzzle["id"])
    assert (await _answer(alice, other, "c3")).status_code == 403

    # Tomorrow brings a new puzzle, not yet answered.
    clock.advance(days=1)
    tomorrow = (await alice.http.get(f"{URL}/daily")).json()
    assert (tomorrow["date"], tomorrow["answer"]) == ("2026-01-02", None)
    assert tomorrow["puzzle"]["id"] == service.daily_puzzle(clock.now.date()).id
