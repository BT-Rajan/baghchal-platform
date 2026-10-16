"""Exception hierarchy. Every error the engine raises derives from EngineError."""


class EngineError(Exception):
    """Base class for all engine errors."""


class InvalidPosition(EngineError, ValueError):
    """A position violates the rules' invariants (piece counts, overlap, side to move)."""


class IllegalMove(EngineError, ValueError):
    """A move is not legal in the position it was played in."""


class NotationError(EngineError, ValueError):
    """Text could not be parsed as a square, move or position."""


class GameOver(EngineError):
    """A move was played after the game had already ended."""
