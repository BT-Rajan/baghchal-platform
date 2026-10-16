"""The board's eight symmetries (rotations and reflections).

Every symmetry maps lines to lines, so it maps legal moves to legal moves. The AI uses this to
share work between equivalent positions; the tests use it as a correctness check.
"""

from collections.abc import Callable
from typing import Final

from baghchal_engine.board import NUM_POINTS, SIZE, file_of, iter_points, point, rank_of
from baghchal_engine.moves import Move
from baghchal_engine.position import Position

_N: Final = SIZE - 1


def _build() -> tuple[tuple[int, ...], ...]:
    maps: tuple[Callable[[int, int], tuple[int, int]], ...] = (
        lambda f, r: (f, r),
        lambda f, r: (_N - r, f),
        lambda f, r: (_N - f, _N - r),
        lambda f, r: (r, _N - f),
        lambda f, r: (_N - f, r),
        lambda f, r: (f, _N - r),
        lambda f, r: (r, f),
        lambda f, r: (_N - r, _N - f),
    )
    return tuple(tuple(point(*m(file_of(p), rank_of(p))) for p in range(NUM_POINTS)) for m in maps)


SYMMETRIES: Final[tuple[tuple[int, ...], ...]] = _build()
"""Eight point permutations; index 0 is the identity."""


def transform_mask(sym: int, mask: int) -> int:
    perm = SYMMETRIES[sym]
    out = 0
    for p in iter_points(mask):
        out |= 1 << perm[p]
    return out


def transform_position(sym: int, pos: Position) -> Position:
    return pos._replace(
        tigers=transform_mask(sym, pos.tigers), goats=transform_mask(sym, pos.goats)
    )


def transform_move(sym: int, move: Move) -> Move:
    perm = SYMMETRIES[sym]
    return Move(
        None if move.src is None else perm[move.src],
        perm[move.dst],
        None if move.over is None else perm[move.over],
    )
