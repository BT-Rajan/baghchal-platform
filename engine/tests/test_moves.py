import random

import pytest
from hypothesis import given

from baghchal_engine import (
    IllegalMove,
    InvalidPosition,
    Move,
    Position,
    Side,
    apply_unchecked,
    has_legal_move,
    legal_moves,
    parse_move,
    parse_position,
    perft,
    play,
)
from baghchal_engine.board import file_of, iter_points, point, rank_of

from . import reference
from .conftest import random_walk, reachable_positions


def _coord(p: int) -> tuple[int, int]:
    return (file_of(p), rank_of(p))


def _coords(mask: int) -> set[tuple[int, int]]:
    return {_coord(p) for p in iter_points(mask)}


def _reference_moves(
    pos: Position,
) -> set[tuple[tuple[int, int] | None, tuple[int, int], tuple[int, int] | None]]:
    return reference.legal_moves(
        _coords(pos.tigers), _coords(pos.goats), pos.side is Side.GOAT, pos.in_hand, pos.captured
    )


def _as_reference(
    move: Move,
) -> tuple[tuple[int, int] | None, tuple[int, int], tuple[int, int] | None]:
    return (
        None if move.src is None else _coord(move.src),
        _coord(move.dst),
        None if move.over is None else _coord(move.over),
    )


def _reference_perft(pos: Position, depth: int) -> int:
    if depth == 0:
        return 1
    total = 0
    for src, dst, over in _reference_moves(pos):
        move = Move(
            None if src is None else point(*src),
            point(*dst),
            None if over is None else point(*over),
        )
        total += _reference_perft(apply_unchecked(pos, move), depth - 1)
    return total


# Pinned move-tree sizes from the initial position. Any change here is a rules change.
PERFT = [1, 21, 252, 5052, 68204, 1304788]


@pytest.mark.parametrize("depth", range(5))
def test_perft_matches_pinned_values(depth: int) -> None:
    assert perft(Position.initial(), depth) == PERFT[depth]


@pytest.mark.parametrize("depth", range(4))
def test_perft_matches_reference(depth: int) -> None:
    assert _reference_perft(Position.initial(), depth) == PERFT[depth]


@given(reachable_positions())
def test_legal_moves_match_reference(pos: Position) -> None:
    moves = legal_moves(pos)
    assert len(moves) == len(set(moves)), "duplicate moves"
    assert {_as_reference(m) for m in moves} == _reference_moves(pos)
    assert has_legal_move(pos) == bool(moves)


@given(reachable_positions())
def test_every_legal_move_leads_to_a_valid_position(pos: Position) -> None:
    for move in legal_moves(pos):
        after = play(pos, move)
        after.validate()
        assert after.side is pos.side.other
        assert after.captured == pos.captured + move.is_capture
        assert after.in_hand == pos.in_hand - move.is_placement


@given(reachable_positions())
def test_goats_cannot_move_while_placing(pos: Position) -> None:
    if pos.side is Side.GOAT and pos.in_hand:
        assert all(m.is_placement for m in legal_moves(pos))


def test_random_games_preserve_invariants() -> None:
    rng = random.Random(20261016)
    for _ in range(200):
        for pos, move in random_walk(rng):
            pos.validate()
            assert move in legal_moves(pos)


def test_legal_moves_are_deterministic() -> None:
    pos = parse_position("T3T/5/2G2/5/T3T t 19 0")
    assert legal_moves(pos) == legal_moves(pos)
    assert legal_moves(pos) == sorted(
        legal_moves(pos), key=lambda m: (m.src, m.over is not None, m.dst)
    )


def test_tiger_capture() -> None:
    pos = parse_position("T3T/5/5/G4/T3T t 15 4")
    move = parse_move("a1xa3")
    assert move in legal_moves(pos)
    after = play(pos, move)
    assert after.captured == 5
    assert after.goats == 0
    assert after.piece_at(point(0, 2)) is Side.TIGER


def test_no_moves_once_five_goats_are_captured() -> None:
    pos = parse_position("1T2T/5/T4/5/T4 g 15 5")
    assert legal_moves(pos) == []
    assert not has_legal_move(pos)


def test_play_rejects_illegal_moves() -> None:
    pos = Position.initial()
    with pytest.raises(IllegalMove):
        play(pos, Move(0, 1))  # tiger move on goats' turn
    with pytest.raises(IllegalMove):
        play(pos, Move(None, 0))  # placing on a tiger


@pytest.mark.parametrize(
    "move",
    [
        Move(None, 12.0),  # type: ignore[arg-type]
        Move(None, True),
        (None, 12, None),
        Move(None, 99),
        Move(None, -1),
    ],
)
def test_play_rejects_malformed_moves(move: Move) -> None:
    with pytest.raises(IllegalMove):
        play(Position.initial(), move)


def test_placement_on_last_goat_starts_movement_phase() -> None:
    pos = parse_position("TGGGT/GGGGG/GGGGG/GGGG1/TG1GT g 1 0")
    after = play(pos, parse_move("e2"))
    assert after.in_hand == 0
    assert not after.placement_phase


@pytest.mark.parametrize(
    ("position", "message"),
    [
        (Position(0b1111, 0b1111, Side.GOAT, 16, 0), "both"),
        (Position(0b111, 0, Side.GOAT, 20, 0), "tigers"),
        (Position(0b1111, 0, Side.TIGER, 20, 0), "first"),
        (Position(0b1111, 1 << 30, Side.GOAT, 19, 0), "outside"),
        (Position(0b1111, 0, Side.GOAT, 21, 0), "in_hand"),
        (Position(0b1111, 0, Side.GOAT, 14, 6), "captured"),
        (Position(0b1111, 0, Side.GOAT, 19, 0), "total"),
        (Position(0b1111, 0, 0, 20, 0), "side"),  # type: ignore[arg-type]
        (Position(0b1111, 0, Side.GOAT, 20.0, 0), "int"),  # type: ignore[arg-type]
    ],
)
def test_validate_rejects_impossible_positions(position: Position, message: str) -> None:
    with pytest.raises(InvalidPosition, match=message):
        position.validate()
