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
    model_config = ConfigDict(extra="forbid")

    board: BoardTheme
    pieces: PieceSet
    sounds: SoundPack
    show_badge: bool


class AppearanceOut(AppearanceIn):
    """What the app uses now: without the themes feature, the free board, pieces and sounds."""
