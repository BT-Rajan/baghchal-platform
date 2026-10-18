"""A review of a finished game: for each move, what the engine thought of it.

Every legal move in each position is searched to the same depth (iterative deepening within a
time budget, as the computer player does); the played move is compared with the best one. The
difference, in the evaluation's units (a captured goat is 1,000), gives the verdict:

- **best**: the engine's choice, or as good;
- **good**: a little worse, but nothing lost;
- **inaccuracy**: a real but small concession;
- **mistake**: a clear concession, such as leaving a goat to be taken;
- **blunder**: a game-changing loss, such as a goat or the game.

The same search ignores the no-repetition rule inside the tree, as the computer player does; the
moves compared at each turn are the game's legal moves.
"""

import time
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from baghchal_engine.ai import WIN, _OutOfTime, _Search
from baghchal_engine.errors import IllegalMove
from baghchal_engine.game import Game
from baghchal_engine.moves import Move, apply_unchecked
from baghchal_engine.notation import format_move
from baghchal_engine.position import Side


class Verdict(StrEnum):
    BEST = "best"
    GOOD = "good"
    INACCURACY = "inaccuracy"
    MISTAKE = "mistake"
    BLUNDER = "blunder"


LIMITS: Final = (
    (0, Verdict.BEST),
    (60, Verdict.GOOD),
    (200, Verdict.INACCURACY),
    (700, Verdict.MISTAKE),
)
"""The largest loss for each verdict; anything more is a blunder."""

SCORE_LIMIT: Final = 5_000
"""Scores are reported within ±this; a forced win is reported as the limit itself."""


@dataclass(frozen=True)
class MoveReview:
    ply: int
    """1 for the first move."""
    side: Side
    move: str
    best: str
    """The engine's choice (the played move when it was as good)."""
    loss: int
    """How much worse the played move was than the best, for its player (0 or more)."""
    verdict: Verdict
    score: int
    """The position before the move with best play, from the tigers' side (positive is good for
    them), within ±SCORE_LIMIT."""


def verdict(loss: int) -> Verdict:
    for limit, name in LIMITS:
        if loss <= limit:
            return name
    return Verdict.BLUNDER


def _scores(game: Game, depth: int, seconds: float) -> dict[Move, int]:
    """Each legal move's score for the side to move, from the deepest search finished in time."""
    pos = game.position
    moves = game.legal_moves()
    scores = dict.fromkeys(moves, 0)
    search = _Search(time.perf_counter() + seconds)
    try:
        for d in range(depth):
            scores = {
                m: -search.negamax(apply_unchecked(pos, m), d, -WIN * 2, WIN * 2) for m in moves
            }
    except _OutOfTime:
        pass
    return scores


def review(moves: Iterable[Move], *, depth: int = 3, seconds: float = 0.25) -> list[MoveReview]:
    """Review ``moves``, a game from the start, spending up to ``seconds`` on each position."""
    game = Game()
    out = []
    for ply, played in enumerate(moves, start=1):
        side = game.position.side
        scores = _scores(game, depth, seconds)
        if played not in scores:
            raise IllegalMove(f"move {ply} is not legal: {format_move(played)}")
        best = max(scores, key=lambda m: (scores[m], m == played))
        loss = scores[best] - scores[played]
        mover = max(-SCORE_LIMIT, min(SCORE_LIMIT, scores[best]))
        out.append(
            MoveReview(
                ply=ply,
                side=side,
                move=format_move(played),
                best=format_move(best),
                loss=loss,
                verdict=verdict(loss),
                score=mover if side is Side.TIGER else -mover,
            )
        )
        game.play(played)
    return out
