import uuid
from datetime import datetime

from pydantic import BaseModel

from baghchal_server.lobby.schemas import PlayerOut


class FiguresOut(BaseModel):
    moves: int
    decisive: int
    """Positions with one clearly best move."""
    agreement: float
    """Share of decisive positions where the player chose the engine's move."""
    average_loss: float
    """What the player gave away in decisive positions (a goat is 1,000)."""
    mistake_rate: float
    """Share of all the player's moves losing more than 200."""
    blunders: int


class CheckedGameOut(BaseModel):
    game_id: uuid.UUID
    side: str
    opponent: PlayerOut
    checked_at: datetime
    screen: FiguresOut
    confirm: FiguresOut | None
    """The deep review, if the screen asked for one."""
    think_median_ms: int
    think_spread: float
    """Standard deviation of think times over their mean: low is machine-like regularity."""
    fast_moves: int


class FairPlayOut(BaseModel):
    """A player's fair-play figures, for moderators: the window they are judged on."""

    games: list[CheckedGameOut]
    """Newest first."""
    screen: FiguresOut
    """The window's quick-review figures, all games together."""
    confirm: FiguresOut | None
    """The deep-review figures, over the games that had one."""
    screen_passed: bool
    """Whether the window earns a deep review (enough games, and clean enough)."""
