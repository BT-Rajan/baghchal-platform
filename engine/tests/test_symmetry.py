from hypothesis import given
from hypothesis import strategies as st

from baghchal_engine import Position, legal_moves
from baghchal_engine.board import CORNERS, JUMPS, NEIGHBOURS, NUM_POINTS
from baghchal_engine.symmetry import (
    SYMMETRIES,
    transform_move,
    transform_position,
)

from .conftest import reachable_positions


def test_eight_distinct_permutations_with_identity_first() -> None:
    assert len(set(SYMMETRIES)) == 8
    assert SYMMETRIES[0] == tuple(range(NUM_POINTS))
    for perm in SYMMETRIES:
        assert sorted(perm) == list(range(NUM_POINTS))


def test_symmetries_preserve_lines() -> None:
    for perm in SYMMETRIES:
        assert {perm[c] for c in CORNERS} == set(CORNERS)
        for a in range(NUM_POINTS):
            assert {perm[b] for b in NEIGHBOURS[a]} == set(NEIGHBOURS[perm[a]])
            assert {(perm[o], perm[land]) for o, land in JUMPS[a]} == set(JUMPS[perm[a]])


def test_initial_position_is_symmetric() -> None:
    for sym in range(8):
        assert transform_position(sym, Position.initial()) == Position.initial()


@given(reachable_positions(), st.integers(0, 7))
def test_legal_moves_commute_with_symmetry(pos: Position, sym: int) -> None:
    image = transform_position(sym, pos)
    image.validate()
    assert {transform_move(sym, m) for m in legal_moves(pos)} == set(legal_moves(image))
