"""Immutable game positions."""

from enum import IntEnum
from typing import Final, NamedTuple

from baghchal_engine.board import ALL_POINTS, CORNERS
from baghchal_engine.errors import InvalidPosition

TOTAL_GOATS: Final = 20
NUM_TIGERS: Final = 4
CAPTURES_TO_WIN: Final = 5


class Side(IntEnum):
    GOAT = 0
    TIGER = 1

    @property
    def other(self) -> "Side":
        return Side.TIGER if self is Side.GOAT else Side.GOAT


class Position(NamedTuple):
    """A complete, hashable snapshot of the board.

    ``tigers`` and ``goats`` are bit masks over the 25 points. ``in_hand`` counts goats not
    yet placed and ``captured`` counts goats taken by tigers. Two positions are the same
    position exactly when they compare equal, which is what repetition detection relies on.

    Construct positions with :meth:`initial`, :func:`~baghchal_engine.notation.parse_position`
    or by playing moves; call :meth:`validate` on any position built by hand.
    """

    tigers: int
    goats: int
    side: Side
    in_hand: int
    captured: int

    @classmethod
    def initial(cls) -> "Position":
        """Tigers on the four corners, all 20 goats in hand, goats to move."""
        return cls(sum(1 << c for c in CORNERS), 0, Side.GOAT, TOTAL_GOATS, 0)

    @property
    def empty(self) -> int:
        return ALL_POINTS & ~(self.tigers | self.goats)

    @property
    def goats_on_board(self) -> int:
        return self.goats.bit_count()

    @property
    def placement_phase(self) -> bool:
        """True while goats still have pieces to place (goats cannot move until then)."""
        return self.in_hand > 0

    def piece_at(self, p: int) -> Side | None:
        bit = 1 << p
        if self.tigers & bit:
            return Side.TIGER
        if self.goats & bit:
            return Side.GOAT
        return None

    def validate(self) -> None:
        """Raise InvalidPosition unless this position can arise under the rules."""
        if not isinstance(self.side, Side):
            raise InvalidPosition("side must be a Side")
        for name in ("tigers", "goats", "in_hand", "captured"):
            if type(getattr(self, name)) is not int:
                raise InvalidPosition(f"{name} must be an int")
        if self.tigers & ~ALL_POINTS or self.goats & ~ALL_POINTS:
            raise InvalidPosition("pieces outside the board")
        if self.tigers & self.goats:
            raise InvalidPosition("a point holds both a tiger and a goat")
        if self.tigers.bit_count() != NUM_TIGERS:
            raise InvalidPosition(f"exactly {NUM_TIGERS} tigers required")
        if not 0 <= self.in_hand <= TOTAL_GOATS:
            raise InvalidPosition(f"in_hand must be 0..{TOTAL_GOATS}")
        if not 0 <= self.captured <= CAPTURES_TO_WIN:
            raise InvalidPosition(f"captured must be 0..{CAPTURES_TO_WIN}")
        if self.goats_on_board + self.in_hand + self.captured != TOTAL_GOATS:
            raise InvalidPosition("goats on board, in hand and captured must total 20")
        # Goats move first, so during placement the side to move is fixed by the count:
        # goats are to move exactly when tigers have answered every placement so far.
        if self.in_hand == TOTAL_GOATS and self.side is not Side.GOAT:
            raise InvalidPosition("goats move first")
