"""The time controls players can choose. A fixed set keeps rating pools meaningful."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Final


class Category(StrEnum):
    BLITZ = "blitz"
    RAPID = "rapid"


@dataclass(frozen=True, slots=True)
class TimeControl:
    initial_seconds: int
    increment_seconds: int
    category: Category

    @property
    def label(self) -> str:
        """``minutes+increment``, as players write it: ``5+3``."""
        return f"{self.initial_seconds // 60}+{self.increment_seconds}"


TIME_CONTROLS: Final = {
    tc.label: tc
    for tc in (
        TimeControl(180, 2, Category.BLITZ),
        TimeControl(300, 3, Category.BLITZ),
        TimeControl(600, 5, Category.RAPID),
        TimeControl(900, 10, Category.RAPID),
    )
}
