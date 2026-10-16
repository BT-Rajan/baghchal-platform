"""Board geometry.

Points are indexed 0..24 as ``rank * 5 + file``: file 0..4 is a..e (left to right) and
rank 0..4 is 1..5 (bottom to top), so a1 is 0 and e5 is 24.

Every point connects orthogonally to its neighbours. A point also connects diagonally
when ``file + rank`` is even, which yields the two long diagonals and the inner diamond.
All tables are computed once at import time and are immutable.
"""

from typing import Final

SIZE: Final = 5
NUM_POINTS: Final = SIZE * SIZE
ALL_POINTS: Final = (1 << NUM_POINTS) - 1
CORNERS: Final = (0, 4, 20, 24)

_DIRECTIONS: Final = ((0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1))


def point(file: int, rank: int) -> int:
    """Return the index of the point at ``file``, ``rank`` (both 0-based)."""
    return rank * SIZE + file


def file_of(p: int) -> int:
    return p % SIZE


def rank_of(p: int) -> int:
    return p // SIZE


def _step(p: int, df: int, dr: int) -> int | None:
    """The point one step from ``p`` in direction (df, dr), or None if no line joins them."""
    f, r = file_of(p) + df, rank_of(p) + dr
    if not (0 <= f < SIZE and 0 <= r < SIZE):
        return None
    if df and dr and (file_of(p) + rank_of(p)) % 2:
        return None
    return point(f, r)


def _build() -> tuple[
    tuple[int, ...], tuple[tuple[int, ...], ...], tuple[tuple[tuple[int, int], ...], ...]
]:
    masks: list[int] = []
    neighbours: list[tuple[int, ...]] = []
    jumps: list[tuple[tuple[int, int], ...]] = []
    for p in range(NUM_POINTS):
        adj: list[int] = []
        jmp: list[tuple[int, int]] = []
        for df, dr in _DIRECTIONS:
            over = _step(p, df, dr)
            if over is None:
                continue
            adj.append(over)
            land = _step(over, df, dr)
            if land is not None:
                jmp.append((over, land))
        adj.sort()
        jmp.sort()
        neighbours.append(tuple(adj))
        jumps.append(tuple(jmp))
        masks.append(sum(1 << q for q in adj))
    return tuple(masks), tuple(neighbours), tuple(jumps)


_TABLES = _build()

NEIGHBOUR_MASK: Final = _TABLES[0]
"""Bit mask of the points adjacent to each point."""
NEIGHBOURS: Final = _TABLES[1]
"""Adjacent points of each point, ascending."""
JUMPS: Final = _TABLES[2]
"""``(over, land)`` pairs for each point: a tiger there may jump ``over`` to ``land``."""


def iter_points(mask: int) -> list[int]:
    """The points set in ``mask``, ascending."""
    out: list[int] = []
    while mask:
        low = mask & -mask
        out.append(low.bit_length() - 1)
        mask ^= low
    return out
