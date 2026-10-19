from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class BoardTheme(StrEnum):
    WOOD = "wood"
    WALNUT = "walnut"
    SLATE = "slate"
    JADE = "jade"
    NIGHT = "night"


class PieceSet(StrEnum):
    CLASSIC = "classic"
    BRONZE = "bronze"
    PORCELAIN = "porcelain"
    ROYAL = "royal"


class SoundPack(StrEnum):
    GENTLE = "gentle"
    WOODBLOCK = "woodblock"
    BELLS = "bells"
    ARCADE = "arcade"


class AppearanceIn(BaseModel):
    """A change: only the fields given are changed."""

    model_config = ConfigDict(extra="forbid")

    board: BoardTheme | None = None
    pieces: PieceSet | None = None
    sounds: SoundPack | None = None
    sounds_on: bool | None = None
    """Whether game sounds play at all (on every device)."""
    emotes_on: bool | None = None
    """Whether the opponent's quick messages reach me in games."""
    show_badge: bool | None = None


class AppearanceOut(BaseModel):
    """What the app uses now: without the themes feature, the free board, pieces and sounds."""

    board: BoardTheme
    pieces: PieceSet
    sounds: SoundPack
    sounds_on: bool
    emotes_on: bool
    show_badge: bool
