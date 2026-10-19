"""Fair-play figures: how close a player's moves came to the engine's, from a review.

Only *decisive* positions tell anything: ones where the best move is clearly better than every
other (by more than a good move's loss). Elsewhere several moves are as good, and a player
matching the engine there means nothing. Mistakes and blunders count over all of a player's
moves. The figures add up, so a player's games can be judged together; one game is never
enough to judge.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from baghchal_engine.position import Side
from baghchal_engine.review import LIMITS, MoveReview

DECISIVE: Final = LIMITS[1][0]
"""A position is decisive when the best move beats the next best by more than this (a
"good" move's largest loss)."""
LOSS_CAP: Final = 1_000
"""Each move's loss counts at most this much (a captured goat), so one lost game does not
swamp the average."""
MISTAKE: Final = LIMITS[2][0]
"""Losses above this are mistakes (or worse)."""
BLUNDER: Final = LIMITS[3][0]
"""Losses above this are blunders."""


@dataclass(frozen=True)
class Figures:
    moves: int = 0
    decisive: int = 0
    """Decisive positions the player moved in."""
    agreed: int = 0
    """Decisive positions where the player chose the engine's move (or one as good)."""
    decisive_loss: int = 0
    """Total loss over decisive positions, each move's capped at LOSS_CAP."""
    mistakes: int = 0
    """Moves losing more than MISTAKE (blunders included)."""
    blunders: int = 0

    def __add__(self, other: "Figures") -> "Figures":
        return Figures(
            moves=self.moves + other.moves,
            decisive=self.decisive + other.decisive,
            agreed=self.agreed + other.agreed,
            decisive_loss=self.decisive_loss + other.decisive_loss,
            mistakes=self.mistakes + other.mistakes,
            blunders=self.blunders + other.blunders,
        )

    @property
    def agreement(self) -> float:
        """Share of decisive positions where the player found the engine's move."""
        return self.agreed / self.decisive if self.decisive else 0.0

    @property
    def average_loss(self) -> float:
        """Average loss in decisive positions."""
        return self.decisive_loss / self.decisive if self.decisive else 0.0

    @property
    def mistake_rate(self) -> float:
        return self.mistakes / self.moves if self.moves else 0.0


def figures(reviews: Iterable[MoveReview]) -> dict[Side, Figures]:
    """Each side's figures for one reviewed game."""
    counts = {side: [0, 0, 0, 0, 0, 0] for side in Side}
    for r in reviews:
        c = counts[r.side]
        c[0] += 1
        if r.margin is not None and r.margin > DECISIVE:
            c[1] += 1
            c[2] += r.loss == 0
            c[3] += min(r.loss, LOSS_CAP)
        c[4] += r.loss > MISTAKE
        c[5] += r.loss > BLUNDER
    return {side: Figures(*c) for side, c in counts.items()}
