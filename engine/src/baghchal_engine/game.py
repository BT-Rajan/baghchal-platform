"""Game records: a start position, the moves played, and how the game ended."""

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

from baghchal_engine.errors import GameOver
from baghchal_engine.moves import Move, has_legal_move, legal_moves, play
from baghchal_engine.position import CAPTURES_TO_WIN, Position, Side


class Reason(StrEnum):
    """Why a game ended on the board. Resignation, time and agreement are platform concerns."""

    FIVE_CAPTURED = "five_captured"
    TIGERS_TRAPPED = "tigers_trapped"
    GOATS_STALEMATED = "goats_stalemated"
    REPETITION = "repetition"


@dataclass(frozen=True, slots=True)
class Outcome:
    winner: Side | None  # None means a draw
    reason: Reason


@dataclass(frozen=True, slots=True)
class Rules:
    """The tunable parts of the rules. See docs/rules.md for why the defaults are what they are."""

    goat_stalemate_winner: Side | None = None
    """Result when goats, in the movement phase, have no legal move: None is a draw."""
    repetition_limit: int = 3
    """A position occurring this many times (same side to move) ends the game in a draw."""

    def __post_init__(self) -> None:
        if self.repetition_limit < 2:
            raise ValueError("repetition_limit must be at least 2")


DEFAULT_RULES = Rules()


def board_outcome(pos: Position, rules: Rules = DEFAULT_RULES) -> Outcome | None:
    """The outcome decided by ``pos`` alone (ignores repetition), or None if play continues."""
    if pos.captured >= CAPTURES_TO_WIN:
        return Outcome(Side.TIGER, Reason.FIVE_CAPTURED)
    if has_legal_move(pos):
        return None
    if pos.side is Side.TIGER:
        return Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)
    return Outcome(rules.goat_stalemate_winner, Reason.GOATS_STALEMATED)


class Game:
    """A game in progress or finished. Only legal moves are ever accepted.

    Repetition counts reset after every placement or capture, since neither can be undone
    and so no earlier position can recur.
    """

    __slots__ = ("_moves", "_outcome", "_position", "_rules", "_seen", "_start")

    def __init__(self, start: Position | None = None, rules: Rules = DEFAULT_RULES) -> None:
        start = Position.initial() if start is None else start
        start.validate()
        self._start = start
        self._rules = rules
        self._position = start
        self._moves: list[Move] = []
        self._seen: dict[Position, int] = {start: 1}
        self._outcome = board_outcome(start, rules)

    @classmethod
    def replay(
        cls, moves: Iterable[Move], start: Position | None = None, rules: Rules = DEFAULT_RULES
    ) -> "Game":
        """Rebuild a game from its move list, validating every move."""
        game = cls(start, rules)
        for move in moves:
            game.play(move)
        return game

    @property
    def start(self) -> Position:
        return self._start

    @property
    def rules(self) -> Rules:
        return self._rules

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
        return [] if self._outcome is not None else legal_moves(self._position)

    def play(self, move: Move) -> Outcome | None:
        """Play a legal move and return the outcome if it ended the game."""
        if self._outcome is not None:
            raise GameOver("the game is over")
        pos = play(self._position, move)
        if move.is_placement or move.is_capture:
            self._seen.clear()
        count = self._seen.get(pos, 0) + 1
        self._seen[pos] = count
        self._position = pos
        self._moves.append(move)
        outcome = board_outcome(pos, self._rules)
        if outcome is None and count >= self._rules.repetition_limit:
            outcome = Outcome(None, Reason.REPETITION)
        self._outcome = outcome
        return outcome
