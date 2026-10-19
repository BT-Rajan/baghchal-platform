"""The time controls players can choose. A fixed set keeps rating pools meaningful.

Most are ``minutes+increment`` (Fischer): each move costs the time taken and earns the
increment. The sand clock is different: both sides start with one minute, and the time a player
takes is added to the opponent's clock, as sand runs from one end of an hourglass to the other.
It is the only time control with one minute and no increment, which is how games, challenges,
seeks and tournaments recognise it without a column of their own.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Final


class Category(StrEnum):
    """The rating pools: Quick (blitz), Standard (rapid) and the sand clock."""

    BLITZ = "blitz"
    RAPID = "rapid"
    SAND = "sand"


SAND_LABEL: Final = "sand"


@dataclass(frozen=True, slots=True)
class TimeControl:
    initial_seconds: int
    increment_seconds: int
    category: Category

    @property
    def label(self) -> str:
        """``minutes+increment``, as players write it (``5+3``), or ``sand``."""
        return label_of(self.initial_seconds, self.increment_seconds)


def label_of(initial_seconds: int, increment_seconds: int) -> str:
    if (initial_seconds, increment_seconds) == (60, 0):
        return SAND_LABEL
    return f"{initial_seconds // 60}+{increment_seconds}"


OFFERED: Final = (
    TimeControl(120, 1, Category.BLITZ),
    TimeControl(180, 2, Category.BLITZ),
    TimeControl(300, 3, Category.RAPID),
    TimeControl(60, 0, Category.SAND),
)
RETIRED: Final = (
    TimeControl(600, 5, Category.RAPID),
    TimeControl(900, 10, Category.RAPID),
)
"""No longer offered, but games, challenges and tournaments made with them still finish and
count (as Standard)."""

TIME_CONTROLS: Final = {tc.label: tc for tc in OFFERED + RETIRED}
"""Every time control a game may have, by label."""


def is_sand(initial_seconds: int, increment_seconds: int) -> bool:
    return label_of(initial_seconds, increment_seconds) == SAND_LABEL


def category_of(initial_seconds: int, increment_seconds: int) -> Category:
    return TIME_CONTROLS[label_of(initial_seconds, increment_seconds)].category
