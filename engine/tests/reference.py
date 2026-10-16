"""A deliberately slow, independent implementation of the rules, used only as a test oracle.

It shares no code with the engine. The board is defined by listing its drawn lines directly
instead of by the parity rule the engine uses, and positions are plain dicts of coordinates.
"""

Coord = tuple[int, int]  # (file, rank)

_ROWS = [[(f, r) for f in range(5)] for r in range(5)]
_COLS = [[(f, r) for r in range(5)] for f in range(5)]
_DIAGONALS = [
    [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4)],
    [(0, 4), (1, 3), (2, 2), (3, 1), (4, 0)],
    [(2, 0), (1, 1), (0, 2)],
    [(0, 2), (1, 3), (2, 4)],
    [(2, 4), (3, 3), (4, 2)],
    [(4, 2), (3, 1), (2, 0)],
]
LINES = _ROWS + _COLS + _DIAGONALS


def _segments(length: int) -> list[list[Coord]]:
    """Every run of ``length`` consecutive points along a line, in both directions."""
    out = []
    for line in LINES:
        for i in range(len(line) - length + 1):
            seg = line[i : i + length]
            out.extend([seg, seg[::-1]])
    return out


STEPS = _segments(2)
JUMPS = _segments(3)


def legal_moves(
    tigers: set[Coord], goats: set[Coord], goat_to_move: bool, in_hand: int, captured: int
) -> set[tuple[Coord | None, Coord, Coord | None]]:
    """Moves as (src, dst, captured goat) triples."""
    if captured >= 5:
        return set()
    occupied = tigers | goats
    everything = {(f, r) for f in range(5) for r in range(5)}
    if goat_to_move and in_hand > 0:
        return {(None, c, None) for c in everything - occupied}
    movers = goats if goat_to_move else tigers
    moves: set[tuple[Coord | None, Coord, Coord | None]] = set()
    for a, b in STEPS:
        if a in movers and b not in occupied:
            moves.add((a, b, None))
    if not goat_to_move:
        for a, b, c in JUMPS:
            if a in tigers and b in goats and c not in occupied:
                moves.add((a, c, b))
    return moves
