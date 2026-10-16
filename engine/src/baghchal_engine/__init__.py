"""Bagh Chal rules engine: pure, dependency-free and deterministic."""

from baghchal_engine.errors import (
    EngineError,
    GameOver,
    IllegalMove,
    InvalidPosition,
    NotationError,
)
from baghchal_engine.game import DEFAULT_RULES, Game, Outcome, Reason, Rules, board_outcome
from baghchal_engine.moves import Move, apply_unchecked, has_legal_move, legal_moves, perft, play
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
    "DEFAULT_RULES",
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
    "Rules",
    "Side",
    "apply_unchecked",
    "board_outcome",
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
]
