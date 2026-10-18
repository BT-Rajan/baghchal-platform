"""A computer player: alpha-beta search over the rules, with three strengths.

The search looks ahead a few moves (iterative deepening until a depth or a time limit is
reached) and scores positions from the tigers' point of view:

- goats captured weigh most (five ends the game);
- goats that a tiger could take right now (a goat left "hanging");
- how freely the tigers move, and tigers with no move at all (trapping them all wins for the
  goats).

Inside the search, the no-repetition rule is ignored (it only matters deep in the movement
phase); the moves considered at the root are always the game's legal moves, so the player
never chooses an illegal move.

Easier levels look less far ahead and add noise to their judgement, so they make the kind of
mistakes people make: they miss threats more than a move away.
"""

import random
import time
from enum import StrEnum
from typing import Final, NamedTuple

from baghchal_engine.board import JUMPS, NEIGHBOUR_MASK, iter_points
from baghchal_engine.errors import GameOver
from baghchal_engine.game import Game
from baghchal_engine.moves import Move, apply_unchecked, legal_moves
from baghchal_engine.position import CAPTURES_TO_WIN, Position, Side

WIN: Final = 100_000
CAPTURED: Final = 1_000
HANGING: Final = 150
MOBILITY: Final = 10
TRAPPED: Final = 120


class Level(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Settings(NamedTuple):
    depth: int
    """How many moves ahead to look, at most."""
    seconds: float
    """Time to stop deepening (the depth in progress is finished first)."""
    noise: int
    """Random error added to each move's score at the root, in evaluation units."""
    blunder: float
    """Chance of playing a random legal move instead."""


LEVELS: Final = {
    Level.EASY: Settings(depth=1, seconds=0.05, noise=300, blunder=0.25),
    Level.MEDIUM: Settings(depth=3, seconds=0.3, noise=60, blunder=0.0),
    Level.HARD: Settings(depth=6, seconds=1.0, noise=0, blunder=0.0),
}


def evaluate(pos: Position) -> int:
    """Score for the tigers (positive is good for them), ignoring whose move it is."""
    if pos.captured >= CAPTURES_TO_WIN:
        return WIN
    empty = pos.empty
    goats = pos.goats
    mobility = 0
    trapped = 0
    hanging = 0
    for tiger in iter_points(pos.tigers):
        steps = (NEIGHBOUR_MASK[tiger] & empty).bit_count()
        jumps = 0
        for over, land in JUMPS[tiger]:
            if goats >> over & 1 and empty >> land & 1:
                jumps += 1
                hanging |= 1 << over
        mobility += steps + jumps
        if steps + jumps == 0:
            trapped += 1
    return (
        CAPTURED * pos.captured
        + HANGING * hanging.bit_count()
        + MOBILITY * mobility
        - TRAPPED * trapped
    )


def _ordered(pos: Position) -> list[Move]:
    """Legal moves, captures first: alpha-beta prunes more when good moves come early."""
    moves = legal_moves(pos)
    moves.sort(key=lambda m: m.over is None)
    return moves


class _OutOfTime(Exception):
    pass


class _Search:
    def __init__(self, deadline: float) -> None:
        self.deadline = deadline
        self.nodes = 0

    def negamax(self, pos: Position, depth: int, alpha: int, beta: int) -> int:
        """Best score for the side to move, ``depth`` moves ahead."""
        self.nodes += 1
        if not self.nodes & 1023 and time.perf_counter() > self.deadline:
            raise _OutOfTime
        if pos.captured >= CAPTURES_TO_WIN:
            # The tigers just made their fifth capture; the side to move (goats) has lost.
            return -WIN - depth
        moves = _ordered(pos)
        if not moves:
            return -WIN - depth  # no legal move: the side to move loses
        if depth == 0:
            score = evaluate(pos)
            return score if pos.side is Side.TIGER else -score
        best = -WIN * 2
        for move in moves:
            score = -self.negamax(apply_unchecked(pos, move), depth - 1, -beta, -alpha)
            best = max(best, score)
            alpha = max(alpha, best)
            if alpha >= beta:
                break
        return best


def choose_move(
    game: Game, level: Level = Level.MEDIUM, *, rng: random.Random | None = None
) -> Move:
    """Pick a move for the side to move in ``game``."""
    moves = game.legal_moves()
    if not moves:
        raise GameOver("the game is over")
    rng = rng or random.Random()  # noqa: S311 - a game opponent, not security
    settings = LEVELS[level]
    if len(moves) == 1:
        return moves[0]
    if settings.blunder and rng.random() < settings.blunder:
        return rng.choice(moves)

    pos = game.position
    search = _Search(time.perf_counter() + settings.seconds)
    moves.sort(key=lambda m: m.over is None)
    scores = dict.fromkeys(moves, 0)
    try:
        for depth in range(settings.depth):
            deeper = {
                m: -search.negamax(apply_unchecked(pos, m), depth, -WIN * 2, WIN * 2) for m in moves
            }
            scores = deeper  # only a depth searched to the end counts
            moves.sort(key=lambda m: scores[m], reverse=True)  # best first next time
    except _OutOfTime:
        pass
    noisy = {m: scores[m] + rng.randint(-settings.noise, settings.noise) for m in moves}
    best = max(noisy.values())
    return rng.choice([m for m in moves if noisy[m] == best])
