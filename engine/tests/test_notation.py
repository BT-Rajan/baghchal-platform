import contextlib

import pytest
from hypothesis import given
from hypothesis import strategies as st

from baghchal_engine import (
    Move,
    NotationError,
    Position,
    format_move,
    format_point,
    format_position,
    legal_moves,
    parse_move,
    parse_point,
    parse_position,
)
from baghchal_engine.board import NUM_POINTS

from .conftest import reachable_positions


def test_point_names() -> None:
    assert format_point(0) == "a1"
    assert format_point(4) == "e1"
    assert format_point(12) == "c3"
    assert format_point(24) == "e5"
    for p in range(NUM_POINTS):
        assert parse_point(format_point(p)) == p


def test_initial_position_text() -> None:
    assert format_position(Position.initial()) == "T3T/5/5/5/T3T g 20 0"
    assert parse_position("T3T/5/5/5/T3T g 20 0") == Position.initial()


@pytest.mark.parametrize(
    ("text", "move"),
    [
        ("c3", Move(None, 12)),
        ("a1-b2", Move(0, 6)),
        ("a1xc3", Move(0, 12, 6)),
        ("b1xd1", Move(1, 3, 2)),
    ],
)
def test_move_text(text: str, move: Move) -> None:
    assert parse_move(text) == move
    assert format_move(move) == text


@given(reachable_positions())
def test_positions_and_moves_round_trip(pos: Position) -> None:
    assert parse_position(format_position(pos)) == pos
    for move in legal_moves(pos):
        assert parse_move(format_move(move)) == move


@pytest.mark.parametrize(
    "text",
    [
        "",
        "f1",
        "a0",
        "a6",
        "A1",
        "a1 ",
        " a1",
        "a1-c1",
        "a1xb1",
        "b1xd3",
        "a1-a1",
        "a1/a2",
        "a1-a2-a3",
        "c3c3",
    ],
)
def test_bad_moves_are_rejected(text: str) -> None:
    with pytest.raises(NotationError):
        parse_move(text)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "T3T/5/5/5/T3T g 20",
        "T3T/5/5/5/T3T g 20 0 x",
        "T3T/5/5/5 g 20 0",
        "T3T/5/5/5/T3T/5 g 20 0",
        "T3T/5/5/5/T3T  g 20 0",
        "T3T/5/5/5/T3T G 20 0",
        "T3T/5/5/5/T3T g 020 0",
        "T3T/5/5/5/T3T g -1 0",
        "T3T/5/5/5/T3T g 2O 0",
        "T12T/5/5/5/T3T g 20 0",
        "T3T/5/5/5/T4 g 20 0",
        "T3T/5/5/5/T3TG g 20 0",
        "T3T/6/5/5/T3T g 20 0",
        "T3T/5/5/5/5T g 20 0",
        "T3T/5/5/5/t3t g 20 0",
        "T3T/5/5/5/T3T t 20 0",
        "T3T/5/5/5/T3T g 19 0",
        "TTTTT/5/5/5/5 g 20 0",
        "T3T/5/5/5/T3T g 20 0" + " " * 40,
    ],
)
def test_bad_positions_are_rejected(text: str) -> None:
    with pytest.raises(NotationError):
        parse_position(text)


@pytest.mark.parametrize("value", [None, 12, b"c3", ["c3"]])
def test_non_strings_are_rejected(value: object) -> None:
    with pytest.raises(NotationError):
        parse_point(value)  # type: ignore[arg-type]
    with pytest.raises(NotationError):
        parse_move(value)  # type: ignore[arg-type]
    with pytest.raises(NotationError):
        parse_position(value)  # type: ignore[arg-type]


@given(st.text(max_size=60))
def test_parsers_only_ever_raise_notation_error(text: str) -> None:
    for parse in (parse_point, parse_move, parse_position):
        with contextlib.suppress(NotationError):
            parse(text)


@given(
    st.from_regex(
        r"[TG1-5]{1,5}(/[TG1-5]{1,5}){4} [gt] (0|[1-9][0-9]?) (0|[1-9][0-9]?)", fullmatch=True
    )
)
def test_well_shaped_positions_parse_to_valid_positions_or_fail_cleanly(text: str) -> None:
    try:
        pos = parse_position(text)
    except NotationError:
        return
    pos.validate()
    assert format_position(pos) == text
