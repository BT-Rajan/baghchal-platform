"""Bagh Chal rules engine: pure, dependency-free and deterministic."""

from baghchal_engine.errors import (
    EngineError,
    GameOver,
    IllegalMove,
    InvalidPosition,
    NotationError,
)
from baghchal_engine.game import Game, Outcome, Reason
from baghchal_engine.moves import (
    Move,
    apply_unchecked,
    has_legal_move,
    legal_moves,
    perft,
    play,
    threats,
)
from baghchal_engine.notation import (
    format_move,
    format_point,
    format_position,
    parse_move,
    parse_point,
    parse_position,
)
from baghchal_engine.position import CAPTURES_TO_WIN, NUM_TIGERS, TOTAL_GOATS, Position, Side

__all__ = [
    "CAPTURES_TO_WIN",
    "NUM_TIGERS",
    "TOTAL_GOATS",
    "EngineError",
    "Game",
    "GameOver",
    "IllegalMove",
    "InvalidPosition",
    "Move",
    "NotationError",
    "Outcome",
    "Position",
    "Reason",
    "Side",
    "apply_unchecked",
    "format_move",
    "format_point",
    "format_position",
    "has_legal_move",
    "legal_moves",
    "parse_move",
    "parse_point",
    "parse_position",
    "perft",
    "play",
    "threats",
]
