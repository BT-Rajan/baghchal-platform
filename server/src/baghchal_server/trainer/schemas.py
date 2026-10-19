from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Kind(StrEnum):
    OPENING = "opening"
    """While goats are still being placed."""
    ENDGAME = "endgame"
    """Once every goat is on the board."""


class PuzzleOut(BaseModel):
    id: str
    kind: Kind
    position: str
    """In BFEN, like a game's."""
    side: Literal["goat", "tiger"]
    """Who is to move: find their best move."""
    legal_moves: list[str]


class Progress(BaseModel):
    solved: int
    """Puzzles of this kind answered right at least once."""
    total: int
    streak: int
    """Right answers in a row, of either kind."""


class TrainerOut(Progress):
    kind: Kind
    puzzle: PuzzleOut | None
    """The next puzzle; None once every one of this kind is solved."""


class AnswerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    move: str = Field(max_length=16)


class AnswerOut(Progress):
    correct: bool
    best: str


class DailyAnswerOut(BaseModel):
    move: str
    correct: bool
    best: str


class DailyOut(BaseModel):
    date: date
    """The day (UTC) this puzzle is for; everyone gets the same one."""
    puzzle: PuzzleOut
    answer: DailyAnswerOut | None
    """My first answer to it today, if I have given one."""
