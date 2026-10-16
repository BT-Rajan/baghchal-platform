"""Game records: a start position, the moves played, and how the game ended.

The traditional rules have no drawn outcome on the board:

- Tigers win by capturing five goats.
- The side to move loses if it has no legal move (goats win by trapping the tigers; tigers
  win in the rare case that the goats are blocked).
- Once all goats are placed, no move may return the board to an arrangement that has
  already occurred in the game. Such a move is illegal, which can leave a side with no
  legal move. Because arrangements are finite and never repeat, every game ends.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from baghchal_engine.errors import GameOver, IllegalMove
from baghchal_engine.moves import Move, apply_unchecked, legal_moves, play
from baghchal_engine.position import CAPTURES_TO_WIN, Position, Side


class Reason(StrEnum):
    """Why a game ended on the board. Resignation and timeouts are platform concerns."""

    FIVE_CAPTURED = "five_captured"
    TIGERS_TRAPPED = "tigers_trapped"
    GOATS_BLOCKED = "goats_blocked"


@dataclass(frozen=True, slots=True)
class Outcome:
    winner: Side
    reason: Reason


class Game:
    """A game in progress or finished. Only legal moves are ever accepted.

    ``_seen`` holds the board arrangements of the movement phase. It is cleared on every
    capture: a capture removes a goat for good, so no earlier arrangement can recur.
    """

    __slots__ = ("_moves", "_outcome", "_position", "_seen", "_start")

    def __init__(self, start: Position | None = None) -> None:
        start = Position.initial() if start is None else start
        start.validate()
        self._start = start
        self._position = start
        self._moves: list[Move] = []
        self._seen: set[tuple[int, int]] = set()
        self._remember(start)
        self._outcome = self._decide()

    @classmethod
    def replay(cls, moves: Iterable[Move], start: Position | None = None) -> "Game":
        """Rebuild a game from its move list, validating every move."""
        game = cls(start)
        for move in moves:
            game.play(move)
        return game

    @property
    def start(self) -> Position:
        return self._start

    @property
    def position(self) -> Position:
        return self._position

    @property
    def moves(self) -> tuple[Move, ...]:
        return tuple(self._moves)

    @property
    def ply(self) -> int:
        return len(self._moves)

    @property
    def outcome(self) -> Outcome | None:
        return self._outcome

    @property
    def is_over(self) -> bool:
        return self._outcome is not None

    def legal_moves(self) -> list[Move]:
        """Legal moves for the side to move, excluding moves that repeat an arrangement."""
        if self._outcome is not None:
            return []
        pos = self._position
        return [m for m in legal_moves(pos) if not self._repeats(apply_unchecked(pos, m))]

    def play(self, move: Move) -> Outcome | None:
        """Play a legal move and return the outcome if it ended the game."""
        if self._outcome is not None:
            raise GameOver("the game is over")
        pos = play(self._position, move)
        if self._repeats(pos):
            raise IllegalMove(f"{move} repeats an earlier board arrangement")
        if move.is_capture:
            self._seen.clear()
        self._remember(pos)
        self._position = pos
        self._moves.append(move)
        self._outcome = self._decide()
        return self._outcome

    def _remember(self, pos: Position) -> None:
        if not pos.placement_phase:
            self._seen.add((pos.tigers, pos.goats))

    def _repeats(self, pos: Position) -> bool:
        return not pos.placement_phase and (pos.tigers, pos.goats) in self._seen

    def _decide(self) -> Outcome | None:
        pos = self._position
        if pos.captured >= CAPTURES_TO_WIN:
            return Outcome(Side.TIGER, Reason.FIVE_CAPTURED)
        if any(not self._repeats(apply_unchecked(pos, m)) for m in legal_moves(pos)):
            return None
        if pos.side is Side.TIGER:
            return Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)
        return Outcome(Side.TIGER, Reason.GOATS_BLOCKED)
