import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from baghchal_server.games.models import EndReason, GameStatus
from baghchal_server.lobby.schemas import PlayerOut

SideName = Literal["goat", "tiger"]


class ResultOut(BaseModel):
    winner: SideName | None
    """None when the game was aborted."""
    reason: EndReason


class ClocksOut(BaseModel):
    goat_ms: int
    tiger_ms: int
    running: SideName | None
    """The side whose clock is counting down at ``server_time``."""


class SideRatingOut(BaseModel):
    rating: int
    """The player's rating in this time control when the game started."""
    change: int | None
    """How much the game moved it; None until a rated game ends with a result."""


class RatingsOut(BaseModel):
    goat: SideRatingOut
    tiger: SideRatingOut


class MatchScoreOut(BaseModel):
    player: PlayerOut
    points: int


class MatchOut(BaseModel):
    id: uuid.UUID
    game: int
    """Which game of the match this is: 1, or 2 (sides swapped)."""
    games: list[uuid.UUID]
    """The match's games so far, in order."""
    score: list[MatchScoreOut]


class GameOut(BaseModel):
    id: uuid.UUID
    goat: PlayerOut
    tiger: PlayerOut
    time_control: str
    rated: bool
    status: GameStatus
    result: ResultOut | None
    position: str
    """BFEN; see docs/rules.md."""
    ply: int
    side_to_move: SideName
    moves: list[str]
    legal_moves: list[str]
    """Empty once the game is over. Excludes moves that would repeat a position."""
    goats_in_danger: list[str] = []
    """On the goats' turn, the goats (points) a tiger could capture next if they did nothing
    about it. Empty on the tigers' turn and once the game is over."""
    clocks: ClocksOut
    ratings: RatingsOut
    match: MatchOut | None
    """Rated games are played as two-game matches."""
    computer: Literal["easy", "medium", "hard"] | None
    """Set when one of the players is the computer: its level."""
    positions: list[str]
    """For replaying a finished game: the position (BFEN) before the first move and after each
    one, so ``positions[ply]``. Empty while the game is in progress."""
    deadline_at: datetime | None
    server_time: datetime
    created_at: datetime
    finished_at: datetime | None


class ComputerGameIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: Literal["easy", "medium", "hard"] = "medium"
    side: Literal["goat", "tiger", "random"] = "random"
    """The side you play."""
    time_control: Literal["3+2", "5+3", "10+5", "15+10"] = "10+5"


Emote = Literal["good_luck", "good_move", "oops", "thanks", "well_played"]
"""Quick messages in a game: a few set phrases, never free text."""


class EmoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    emote: Emote


class MoveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ply: Annotated[int, Field(ge=0, le=10_000)]
    """The number of moves the client has seen; the move is rejected if the game moved on."""
    move: Annotated[str, StringConstraints(min_length=2, max_length=5, strict=True)]


class GameSummaryOut(BaseModel):
    """A finished game, from one player's side, for their game history."""

    id: uuid.UUID
    opponent: PlayerOut
    side: SideName
    """The side this player had."""
    time_control: str
    rated: bool
    computer: Literal["easy", "medium", "hard"] | None
    result: ResultOut
    outcome: Literal["won", "lost", "aborted"]
    """How it went for this player."""
    rating_change: int | None
    moves: int
    finished_at: datetime


class MoveReviewOut(BaseModel):
    ply: int
    side: SideName
    move: str
    best: str
    """The engine's choice; the played move when it was as good."""
    loss: int
    """How much worse than the best move, for its player (a goat is 1,000)."""
    verdict: Literal["best", "good", "inaccuracy", "mistake", "blunder"]
    score: int
    """The position before the move with best play, from the tigers' side (positive: tigers
    better), within ±5,000."""


class AnalysisOut(BaseModel):
    game_id: uuid.UUID
    moves: list[MoveReviewOut]
    created_at: datetime
    left_today: int | None
    """Analyses of new games left today for the asking player; None: no limit."""
