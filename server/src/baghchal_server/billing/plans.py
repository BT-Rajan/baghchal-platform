"""The plan catalogue: which features each plan unlocks, and what it costs.

Code asks for a *feature*, never a plan, so an admin can grant a single feature as well as a
whole plan, and a plan's contents can change without touching the code that checks them.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Final


class Plan(StrEnum):
    FREE = "free"
    PLUS = "plus"
    PRO = "pro"


class Feature(StrEnum):
    COMPUTER_HARD = "computer_hard"
    """Play the computer at its hardest level."""
    FULL_HISTORY = "full_history"
    """Game history and replay beyond the last 30 days."""
    ANALYSIS = "analysis"
    """The engine's review of a finished game, move by move."""
    THEMES = "themes"
    """Board and coin themes, and sound packs."""
    BADGE = "badge"
    """A Plus or Pro badge next to the username."""
    PRIVATE_ROOMS = "private_rooms"
    TOURNAMENTS = "tournaments"
    TRAINER = "trainer"
    """Opening and endgame practice against the engine."""


RANK: Final = {Plan.FREE: 0, Plan.PLUS: 1, Plan.PRO: 2}

_PLUS: Final = frozenset(
    {
        Feature.COMPUTER_HARD,
        Feature.FULL_HISTORY,
        Feature.ANALYSIS,
        Feature.THEMES,
        Feature.BADGE,
    }
)
FEATURES: Final[dict[Plan, frozenset[Feature]]] = {
    Plan.FREE: frozenset(),
    Plan.PLUS: _PLUS,
    Plan.PRO: _PLUS | {Feature.PRIVATE_ROOMS, Feature.TOURNAMENTS, Feature.TRAINER},
}

FREE_HISTORY_DAYS: Final = 30
"""Without FULL_HISTORY, a player's history shows only games from these last days."""

ANALYSES_PER_DAY: Final[dict[Plan, int | None]] = {Plan.FREE: 0, Plan.PLUS: 5, Plan.PRO: None}
"""Game analyses a day (None: no limit). A granted ANALYSIS feature counts as unlimited."""


@dataclass(frozen=True)
class Price:
    monthly_paise: int
    yearly_paise: int


PRICES: Final = {
    Plan.PLUS: Price(monthly_paise=149_00, yearly_paise=1_490_00),
    Plan.PRO: Price(monthly_paise=299_00, yearly_paise=2_990_00),
}
"""In Indian rupees (paise), charged through Razorpay. Yearly is ten months' price."""

NAMES: Final = {Plan.FREE: "Free", Plan.PLUS: "Plus", Plan.PRO: "Pro"}

FEATURE_NAMES: Final = {
    Feature.COMPUTER_HARD: "the Hard computer",
    Feature.FULL_HISTORY: "full game history",
    Feature.ANALYSIS: "game analysis",
    Feature.THEMES: "themes and sound packs",
    Feature.BADGE: "a profile badge",
    Feature.PRIVATE_ROOMS: "private rooms",
    Feature.TOURNAMENTS: "tournaments",
    Feature.TRAINER: "the trainer",
}
"""How emails name a feature granted on its own."""
