from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class Achievement(StrEnum):
    FIRST_WIN = "first_win"
    GOAT_WIN = "goat_win"
    TIGER_WIN = "tiger_win"
    TRAPPED = "trapped"
    """Won as goats by trapping the tigers."""
    FIVE_CAPTURES = "five_captures"
    """Won as tigers by capturing five goats."""
    BEAT_MEDIUM = "beat_medium"
    BEAT_HARD = "beat_hard"
    RATED_10 = "rated_10"
    """Ten rated games played to a result."""
    PUZZLE_STREAK_7 = "puzzle_streak_7"
    """The daily puzzle solved seven days in a row."""


class AchievementOut(BaseModel):
    key: Achievement
    earned_at: datetime | None
    """When it was earned; None while still to get."""
