"""Text formats for points, moves and positions.

Points are ``a1``..``e5`` (file a-e left to right, rank 1-5 bottom to top).

Moves: a placement is the point (``c3``), a step is ``a1-a2``, a capture is ``a1xa3``.

Positions use BFEN, modelled on chess FEN: five ranks from rank 5 down to rank 1 separated by
``/``, each rank using ``T`` for a tiger, ``G`` for a goat and a digit for a run of empty
points; then the side to move (``g`` or ``t``), goats in hand, and goats captured.
The initial position is ``T3T/5/5/5/T3T g 20 0``.

All parsers are strict: they accept only the canonical form produced by the formatters, and
raise NotationError (never anything else) on bad input.
"""

import re
from typing import Final

from baghchal_engine.board import JUMPS, NEIGHBOURS, SIZE, file_of, point, rank_of
from baghchal_engine.errors import InvalidPosition, NotationError
from baghchal_engine.moves import Move
from baghchal_engine.position import Position, Side

_FILES: Final = "abcde"
_MAX_MOVE_LEN: Final = 5
_MAX_POSITION_LEN: Final = 40
_POINT_RE: Final = re.compile(r"[a-e][1-5]")
_MOVE_RE: Final = re.compile(r"([a-e][1-5])(?:([-x])([a-e][1-5]))?")
_RANK_RE: Final = re.compile(r"[TG1-5]{1,5}")
_COUNT_RE: Final = re.compile(r"0|[1-9][0-9]?")


def format_point(p: int) -> str:
    return f"{_FILES[file_of(p)]}{rank_of(p) + 1}"


def parse_point(text: str) -> int:
    if not isinstance(text, str) or not _POINT_RE.fullmatch(text):
        raise NotationError(f"not a point: {text!r}")
    return point(_FILES.index(text[0]), int(text[1]) - 1)


def format_move(move: Move) -> str:
    if move.src is None:
        return format_point(move.dst)
    sep = "-" if move.over is None else "x"
    return f"{format_point(move.src)}{sep}{format_point(move.dst)}"


def parse_move(text: str) -> Move:
    """Parse a move. Checks board geometry, not whether the move is legal in some position."""
    if not isinstance(text, str) or len(text) > _MAX_MOVE_LEN:
        raise NotationError(f"not a move: {text!r}")
    m = _MOVE_RE.fullmatch(text)
    if not m:
        raise NotationError(f"not a move: {text!r}")
    first, sep, second = m.groups()
    a = parse_point(first)
    if sep is None:
        return Move(None, a)
    b = parse_point(second)
    if sep == "-":
        if b not in NEIGHBOURS[a]:
            raise NotationError(f"{text!r}: points are not adjacent")
        return Move(a, b)
    for over, land in JUMPS[a]:
        if land == b:
            return Move(a, b, over)
    raise NotationError(f"{text!r}: not a jump along a line")


def format_position(pos: Position) -> str:
    ranks: list[str] = []
    for r in range(SIZE - 1, -1, -1):
        out: list[str] = []
        run = 0
        for f in range(SIZE):
            piece = pos.piece_at(point(f, r))
            if piece is None:
                run += 1
                continue
            if run:
                out.append(str(run))
                run = 0
            out.append("T" if piece is Side.TIGER else "G")
        if run:
            out.append(str(run))
        ranks.append("".join(out))
    side = "g" if pos.side is Side.GOAT else "t"
    return f"{'/'.join(ranks)} {side} {pos.in_hand} {pos.captured}"


def _parse_rank(row: str, rank: int) -> tuple[int, int]:
    """Parse one BFEN rank into (tiger mask, goat mask)."""
    if not _RANK_RE.fullmatch(row):
        raise NotationError(f"bad rank {row!r}")
    tigers = goats = 0
    f = 0
    prev_digit = False
    for ch in row:
        if ch.isdigit():
            if prev_digit:
                raise NotationError(f"bad rank {row!r}: consecutive digits")
            f += int(ch)
            prev_digit = True
            continue
        if f >= SIZE:
            raise NotationError(f"bad rank {row!r}: too long")
        bit = 1 << point(f, rank)
        if ch == "T":
            tigers |= bit
        else:
            goats |= bit
        f += 1
        prev_digit = False
    if f != SIZE:
        raise NotationError(f"bad rank {row!r}: must cover {SIZE} points")
    return tigers, goats


def parse_position(text: str) -> Position:
    """Parse and validate a BFEN string."""
    if not isinstance(text, str) or len(text) > _MAX_POSITION_LEN:
        raise NotationError("not a position")
    fields = text.split(" ")
    if len(fields) != 4:
        raise NotationError("a position has four space-separated fields")
    board, side_text, hand_text, cap_text = fields
    rows = board.split("/")
    if len(rows) != SIZE:
        raise NotationError(f"a position has {SIZE} ranks")
    tigers = goats = 0
    for i, row in enumerate(rows):
        t, g = _parse_rank(row, SIZE - 1 - i)
        tigers |= t
        goats |= g
    if side_text not in ("g", "t"):
        raise NotationError("side to move must be 'g' or 't'")
    if not _COUNT_RE.fullmatch(hand_text) or not _COUNT_RE.fullmatch(cap_text):
        raise NotationError("bad goat counts")
    pos = Position(
        tigers, goats, Side.GOAT if side_text == "g" else Side.TIGER, int(hand_text), int(cap_text)
    )
    try:
        pos.validate()
    except InvalidPosition as e:
        raise NotationError(str(e)) from e
    return pos
