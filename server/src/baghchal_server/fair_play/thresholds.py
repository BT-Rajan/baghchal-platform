"""When a player's games call for a moderator's look. Set from the calibration in
``tools/fair_play_calibrate.py`` (results in docs/plans/phase-7-fair-play.md); a flag needs
both stages, many games and many decisive positions.

The figures (baghchal_engine.fair_play): *agreement* is the share of decisive positions where
the player chose the engine's move; *average loss* is what they gave away there, in evaluation
units (a goat is 1,000); *mistake rate* is the share of all their moves losing more than 200.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Final

from baghchal_engine.fair_play import Figures

MIN_PLIES: Final = 20
"""Shorter rated games are not checked: too little to go on."""
WINDOW_GAMES: Final = 20
"""A player is judged on their latest checked rated games, at most this many..."""
WINDOW_DAYS: Final = 90
"""...within this many days."""
MIN_GAMES: Final = 8
MIN_DECISIVE: Final = 80
"""A window needs this many games and decisive positions before anything is judged."""

SCREEN_DEPTH: Final = 3
SCREEN_SECONDS: Final = 0.25
CONFIRM_DEPTH: Final = 6
CONFIRM_SECONDS: Final = 1.0

AUTO_REPORT_COOLDOWN: Final = timedelta(days=30)
"""After a moderator dismisses an automatic report, none is filed again for this long..."""
COOLDOWN_GAMES: Final = 20
"""...unless this many more of the player's games have been checked since."""


@dataclass(frozen=True)
class Bar:
    """The figures a window must reach, all of them, to pass."""

    min_agreement: float
    max_average_loss: float
    max_mistake_rate: float

    def passed(self, figures: Figures) -> bool:
        return (
            figures.decisive >= MIN_DECISIVE
            and figures.agreement >= self.min_agreement
            and figures.average_loss <= self.max_average_loss
            and figures.mistake_rate <= self.max_mistake_rate
        )


# Calibration (tools/fair_play_calibrate.py, 64 games, windows of 8 games; see the plan):
#
#   engine's move / loss / mistakes, average (range)
#               quick review                                 deep review
#   Easy bot    38% (0-67) / 453 (158-844) / 12% (6-21)     22% / 570 / 20%
#   Medium bot  99.7% (97-100) / 0.2 (0-2) / 0%             74% (54-90) / 119 (33-228) / 5% (1-9)
#   Hard bot    85% (72-96) / 37 (4-67) / 1.3% (0-2.7)      100% / 0 / 0%
#
# Each bar sits beyond the bots standing in for people, with room to spare.

SCREEN_BAR: Final = Bar(min_agreement=0.70, max_average_loss=80.0, max_mistake_rate=0.03)
"""The quick review: play this clean over a window earns a deep review."""
CONFIRM_BAR: Final = Bar(min_agreement=0.95, max_average_loss=15.0, max_mistake_rate=0.005)
"""The deep review: play this close to a strong engine is reported to the moderators."""
EXACT_BAR: Final = Bar(min_agreement=0.97, max_average_loss=3.0, max_mistake_rate=0.002)
"""The quick review itself: play that matches a shallow engine move for move (as nobody but
that engine does; even the Hard bot does not) is reported without a deep review."""
