import os
import random
from collections.abc import Iterator

from hypothesis import HealthCheck, settings
from hypothesis import strategies as st

from baghchal_engine import Game, Move, Position, apply_unchecked, legal_moves

settings.register_profile("ci", max_examples=500, suppress_health_check=[HealthCheck.too_slow])
settings.register_profile("dev", max_examples=100)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "dev"))


def random_walk(rng: random.Random, max_plies: int = 200) -> Iterator[tuple[Position, Move]]:
    """Yield (position, move) pairs along a random legal game from the initial position."""
    pos = Position.initial()
    for _ in range(max_plies):
        moves = legal_moves(pos)
        if not moves:
            return
        move = rng.choice(moves)
        yield pos, move
        pos = apply_unchecked(pos, move)


@st.composite
def reachable_positions(draw: st.DrawFn) -> Position:
    """Positions reachable from the start by legal play, biased toward the movement phase."""
    seed = draw(st.integers(0, 2**32 - 1))
    plies = draw(st.integers(0, 120))
    rng = random.Random(seed)
    pos = Position.initial()
    for _ in range(plies):
        moves = legal_moves(pos)
        if not moves:
            break
        pos = apply_unchecked(pos, rng.choice(moves))
    return pos


@st.composite
def games(draw: st.DrawFn) -> Game:
    """A game played with random legal moves, possibly to completion."""
    seed = draw(st.integers(0, 2**32 - 1))
    rng = random.Random(seed)
    game = Game()
    for _ in range(draw(st.integers(0, 300))):
        moves = game.legal_moves()
        if not moves:
            break
        game.play(rng.choice(moves))
    return game
