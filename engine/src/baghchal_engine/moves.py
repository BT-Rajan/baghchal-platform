"""Move generation and application."""

from typing import NamedTuple

from baghchal_engine.board import JUMPS, NEIGHBOUR_MASK, NEIGHBOURS, iter_points
from baghchal_engine.errors import IllegalMove
from baghchal_engine.position import CAPTURES_TO_WIN, Position, Side


class Move(NamedTuple):
    """A placement (``src is None``), a step, or a tiger capture (``over`` is the goat taken)."""

    src: int | None
    dst: int
    over: int | None = None

    @property
    def is_placement(self) -> bool:
        return self.src is None

    @property
    def is_capture(self) -> bool:
        return self.over is not None


def legal_moves(pos: Position) -> list[Move]:
    """All legal moves for the side to move, in a deterministic order.

    A position with five goats captured is finished and has no legal moves.
    """
    if pos.captured >= CAPTURES_TO_WIN:
        return []
    empty = pos.empty
    moves: list[Move] = []
    if pos.side is Side.GOAT:
        if pos.in_hand:
            return [Move(None, p) for p in iter_points(empty)]
        for src in iter_points(pos.goats):
            moves.extend(Move(src, dst) for dst in NEIGHBOURS[src] if empty >> dst & 1)
        return moves
    goats = pos.goats
    for src in iter_points(pos.tigers):
        moves.extend(Move(src, dst) for dst in NEIGHBOURS[src] if empty >> dst & 1)
        moves.extend(
            Move(src, land, over)
            for over, land in JUMPS[src]
            if goats >> over & 1 and empty >> land & 1
        )
    return moves


def has_legal_move(pos: Position) -> bool:
    """Equivalent to ``bool(legal_moves(pos))`` but stops at the first move found."""
    if pos.captured >= CAPTURES_TO_WIN:
        return False
    empty = pos.empty
    if pos.side is Side.GOAT:
        if pos.in_hand:
            return empty != 0
        return any(NEIGHBOUR_MASK[src] & empty for src in iter_points(pos.goats))
    goats = pos.goats
    for src in iter_points(pos.tigers):
        if NEIGHBOUR_MASK[src] & empty:
            return True
        for over, land in JUMPS[src]:
            if goats >> over & 1 and empty >> land & 1:
                return True
    return False


def apply_unchecked(pos: Position, move: Move) -> Position:
    """Play ``move`` without checking legality. Only pass moves from :func:`legal_moves`."""
    if move.src is None:
        return Position(
            pos.tigers, pos.goats | 1 << move.dst, Side.TIGER, pos.in_hand - 1, pos.captured
        )
    step = 1 << move.src | 1 << move.dst
    if pos.side is Side.GOAT:
        return Position(pos.tigers, pos.goats ^ step, Side.TIGER, pos.in_hand, pos.captured)
    if move.over is None:
        return Position(pos.tigers ^ step, pos.goats, Side.GOAT, pos.in_hand, pos.captured)
    return Position(
        pos.tigers ^ step, pos.goats & ~(1 << move.over), Side.GOAT, pos.in_hand, pos.captured + 1
    )


def play(pos: Position, move: Move) -> Position:
    """Play ``move``, raising IllegalMove unless it is legal in ``pos``."""
    # Reject look-alikes such as Move(1.0, 2) or Move(True, 2): they compare equal to real
    # moves but are not what any client should be sending.
    if type(move) is not Move or not all(
        v is None or type(v) is int for v in (move.src, move.dst, move.over)
    ):
        raise IllegalMove("malformed move")
    if move not in legal_moves(pos):
        raise IllegalMove(f"{move} is not legal")
    return apply_unchecked(pos, move)


def perft(pos: Position, depth: int) -> int:
    """Count leaf nodes of the legal-move tree ``depth`` plies deep; checks move generation."""
    if depth == 0:
        return 1
    moves = legal_moves(pos)
    if depth == 1:
        return len(moves)
    return sum(perft(apply_unchecked(pos, m), depth - 1) for m in moves)
