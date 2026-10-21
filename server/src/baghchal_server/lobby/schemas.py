import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from baghchal_server.lobby.models import ChallengeStatus

TimeControlLabel = Literal["2+1", "3+2", "5+3", "sand"]
"""The time controls on offer (see ``time_controls``)."""
Side = Literal["goat", "tiger", "random"]
UsernameQuery = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,20}$", strict=True)]


Badge = Literal["plus", "pro"]


class PlayerOut(BaseModel):
    id: uuid.UUID
    username: str
    badge: Badge | None = None
    """ClawPlay Plus or Pro, shown next to the name; given where names are shown large (games,
    profiles, leaderboards, players online)."""


class PlayerStatusOut(PlayerOut):
    online: bool
    playing: bool
    """In a live game right now."""


class RatingOut(BaseModel):
    rating: int
    deviation: int
    """Uncertainty; it grows while a player is away and shrinks as they play."""
    games: int
    provisional: bool
    """Still settling: shown as provisional and kept off the leaderboard."""
    rank: int | None
    """Place on the leaderboard, if listed."""


class ProfileOut(PlayerStatusOut):
    created_at: datetime
    ratings: dict[str, RatingOut]
    """By time-control category (``blitz``, ``rapid``)."""
    blocked: bool
    """The viewer has blocked this player."""
    friend: Literal["none", "friends", "requested", "incoming"] = "none"
    """How the viewer stands with this player: friends, a request sent or received, or none."""


class ChallengeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opponent: UsernameQuery | None = None
    """None: a challenge by link, for whoever opens it first (casual only)."""
    time_control: TimeControlLabel
    rated: bool = False
    side: Side | None = None
    """Casual games only (default random). Rated games are two-game matches with sides swapped."""

    @model_validator(mode="after")
    def _side_rules(self) -> "ChallengeIn":
        if self.rated and self.opponent is None:
            raise ValueError("challenges by link are casual; name an opponent for a rated game")
        if self.rated and self.side is not None:
            raise ValueError("rated games alternate sides; leave side out")
        if not self.rated and self.side is None:
            self.side = "random"
        return self


class ChallengeTournamentOut(BaseModel):
    """The tournament a challenge plays a game of."""

    code: str
    name: str
    round: int


class ChallengeOut(BaseModel):
    id: uuid.UUID
    challenger: PlayerOut
    opponent: PlayerOut | None
    """None for a challenge by link that nobody has accepted yet."""
    code: str | None = None
    """A challenge by link: share ``/c/<code>``."""
    time_control: str
    rated: bool
    side: Side | None
    status: ChallengeStatus
    created_at: datetime
    expires_at: datetime
    game_id: uuid.UUID | None = None
    """The game started by accepting this challenge."""
    tournament: ChallengeTournamentOut | None = None
    """A tournament game ("Play now"): casual, sides as paired."""


class ChallengeList(BaseModel):
    incoming: list[ChallengeOut]
    outgoing: list[ChallengeOut]
