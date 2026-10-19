"""The trainer (a Pro feature): opening and endgame puzzles with one clearly best move.

Everyone, on any plan, gets the daily puzzle: one of the same puzzles, the same for everyone
on a given day (UTC), answered the same way.

Puzzles come from the computer's games (``server/scripts/make_puzzles.py``) and ship in
``puzzles.json``. Answers are checked here, so the solutions never reach the browser. Each
player meets the puzzles in their own order, and a missed puzzle comes back later.
"""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from importlib import resources
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_engine import Game, NotationError, Side, format_move, parse_move, parse_position
from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import Feature
from baghchal_server.errors import AppError
from baghchal_server.trainer.models import Attempt
from baghchal_server.trainer.schemas import (
    AnswerOut,
    DailyAnswerOut,
    DailyOut,
    Kind,
    Progress,
    PuzzleOut,
    TrainerOut,
)

WHAT: Final = "The trainer"
STREAK_WINDOW: Final = 200


@dataclass(frozen=True, slots=True)
class Puzzle:
    id: str
    kind: Kind
    position: str
    best: str


def _load() -> dict[str, Puzzle]:
    raw = json.loads(resources.files(__package__).joinpath("puzzles.json").read_text())
    return {p["id"]: Puzzle(p["id"], Kind(p["kind"]), p["position"], p["best"]) for p in raw}


PUZZLES: Final = _load()


def _order(user_id: uuid.UUID, puzzle_id: str) -> str:
    """Each player's own shuffle of the puzzles, the same every time."""
    return hashlib.sha256(f"{user_id}:{puzzle_id}".encode()).hexdigest()


def daily_puzzle(day: date) -> Puzzle:
    """The day's puzzle, picked from all of them by a hash of the date."""
    ids = sorted(PUZZLES)
    index = int(hashlib.sha256(day.isoformat().encode()).hexdigest(), 16) % len(ids)
    return PUZZLES[ids[index]]


async def daily(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> DailyOut:
    """Today's puzzle, for everyone, and my first answer to it today."""
    day = now.astimezone(UTC).date()
    puzzle = daily_puzzle(day)
    first = await db.scalar(
        select(Attempt)
        .where(
            Attempt.user_id == user_id,
            Attempt.puzzle_id == puzzle.id,
            Attempt.created_at >= datetime.combine(day, time(), UTC),
        )
        .order_by(Attempt.created_at, Attempt.id)
        .limit(1)
    )
    return DailyOut(
        date=day,
        puzzle=_out(puzzle),
        answer=None
        if first is None
        else DailyAnswerOut(move=first.move, correct=first.correct, best=puzzle.best),
    )


def _out(puzzle: Puzzle) -> PuzzleOut:
    game = Game(parse_position(puzzle.position))
    return PuzzleOut(
        id=puzzle.id,
        kind=puzzle.kind,
        position=puzzle.position,
        side="goat" if game.position.side == Side.GOAT else "tiger",
        legal_moves=[format_move(m) for m in game.legal_moves()],
    )


async def _progress(
    db: AsyncSession, user_id: uuid.UUID, kind: Kind
) -> tuple[Progress, set[str], str | None]:
    """Progress, the puzzles solved, and the one answered last."""
    attempts = list(
        await db.scalars(
            select(Attempt)
            .where(Attempt.user_id == user_id)
            .order_by(Attempt.created_at.desc(), Attempt.id)
            .limit(STREAK_WINDOW)
        )
    )
    solved = set(
        await db.scalars(
            select(Attempt.puzzle_id).where(Attempt.user_id == user_id, Attempt.correct)
        )
    )
    streak = next((i for i, a in enumerate(attempts) if not a.correct), len(attempts))
    mine = {p for p in solved if p in PUZZLES and PUZZLES[p].kind == kind}
    total = sum(1 for p in PUZZLES.values() if p.kind == kind)
    last = attempts[0].puzzle_id if attempts else None
    return Progress(solved=len(mine), total=total, streak=streak), solved, last


async def next_puzzle(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, kind: Kind
) -> TrainerOut:
    await billing.require(db, user_id, now, Feature.TRAINER, WHAT)
    progress, solved, last = await _progress(db, user_id, kind)
    left = sorted(
        (p for p in PUZZLES.values() if p.kind == kind and p.id not in solved),
        key=lambda p: _order(user_id, p.id),
    )
    # A missed puzzle waits until another has been tried.
    if len(left) > 1 and left[0].id == last:
        left.append(left.pop(0))
    return TrainerOut(**progress.model_dump(), kind=kind, puzzle=_out(left[0]) if left else None)


async def answer(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, puzzle_id: str, move: str
) -> AnswerOut:
    # Today's puzzle is for everyone; the rest are the trainer's.
    if puzzle_id != daily_puzzle(now.astimezone(UTC).date()).id:
        await billing.require(db, user_id, now, Feature.TRAINER, WHAT)
    puzzle = PUZZLES.get(puzzle_id)
    if puzzle is None:
        raise AppError(404, "puzzle_not_found", "No such puzzle.")
    try:
        played = parse_move(move)
    except NotationError:
        played = None
    if played is None or played not in Game(parse_position(puzzle.position)).legal_moves():
        raise AppError(400, "illegal_move", "That move is not legal here.")
    correct = played == parse_move(puzzle.best)
    db.add(
        Attempt(
            id=uuid.uuid4(),
            user_id=user_id,
            puzzle_id=puzzle.id,
            move=format_move(played),
            correct=correct,
            created_at=now,
        )
    )
    await db.commit()
    progress, _, _ = await _progress(db, user_id, puzzle.kind)
    return AnswerOut(**progress.model_dump(), correct=correct, best=puzzle.best)
