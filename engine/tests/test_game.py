import pytest
from hypothesis import given

from baghchal_engine import (
    Game,
    GameOver,
    IllegalMove,
    InvalidPosition,
    Move,
    Outcome,
    Position,
    Reason,
    Side,
    apply_unchecked,
    legal_moves,
    parse_move,
    parse_position,
)

from .conftest import games

TRAPPED = "TGGGT/GG1GG/G1G1G/GG1GG/TGGGT t 3 0"
ONE_FROM_TRAPPED = "TGGGT/GG1GG/G3G/GG1GG/TGGGT g 4 0"
GOATS_STUCK = "GGGGT/GGGGG/GGGGG/TTGGG/1TGGG g 0 0"
SHUFFLE = "TGGGT/GGGGG/GGGGG/1GGG1/T3T g 0 4"
# Positions where three quiet moves leave the side to move with only a repeating move.
BAN_TRAPS_TIGERS = ("GTGGG/GGGTG/GGGGG/TGGG1/G1TGG g 0 1", ("e1-e2", "c1-b1", "e2-e1"))
BAN_BLOCKS_GOATS = ("GGGGG/GTGGG/TGTGG/1TGGG/G1GGG t 0 1", ("b2-a2", "a1-b1", "a2-b2"))


def _play(game: Game, *moves: str) -> Outcome | None:
    outcome = None
    for m in moves:
        outcome = game.play(parse_move(m))
    return outcome


def test_new_game() -> None:
    game = Game()
    assert game.start == Position.initial()
    assert game.position == Position.initial()
    assert game.position.side is Side.GOAT  # goats move first
    assert game.ply == 0
    assert game.moves == ()
    assert not game.is_over
    assert len(game.legal_moves()) == 21


def test_tigers_win_on_fifth_capture() -> None:
    game = Game(parse_position("T3T/5/5/G4/T3T t 15 4"))
    assert _play(game, "a1xa3") == Outcome(Side.TIGER, Reason.FIVE_CAPTURED)
    assert game.is_over
    assert game.legal_moves() == []


def test_goats_win_by_trapping_every_tiger() -> None:
    game = Game(parse_position(ONE_FROM_TRAPPED))
    assert _play(game, "c3") == Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)


def test_tigers_win_when_goats_are_blocked() -> None:
    assert Game(parse_position(GOATS_STUCK)).outcome == Outcome(Side.TIGER, Reason.GOATS_BLOCKED)


def test_game_starting_from_a_finished_position_is_already_over() -> None:
    game = Game(parse_position(TRAPPED))
    assert game.outcome == Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)
    with pytest.raises(GameOver):
        game.play(parse_move("a1-b1"))


def test_returning_to_an_earlier_arrangement_is_illegal() -> None:
    game = Game(parse_position(SHUFFLE))
    _play(game, "d2-d1", "a1-b1", "d1-d2")
    back = parse_move("b1-a1")
    assert back in legal_moves(game.position)  # fine on the board alone...
    assert back not in game.legal_moves()  # ...but it would recreate the start
    with pytest.raises(IllegalMove, match="repeats"):
        game.play(back)
    assert game.ply == 3


@pytest.mark.parametrize(
    ("case", "outcome"),
    [
        (BAN_TRAPS_TIGERS, Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)),
        (BAN_BLOCKS_GOATS, Outcome(Side.TIGER, Reason.GOATS_BLOCKED)),
    ],
)
def test_repetition_ban_can_leave_a_side_without_moves(
    case: tuple[str, tuple[str, ...]], outcome: Outcome
) -> None:
    start, moves = case
    game = Game(parse_position(start))
    assert _play(game, *moves) == outcome
    assert legal_moves(game.position), "only the ban stops the side to move"


def test_placement_phase_positions_never_count_as_repeats() -> None:
    game = Game()
    _play(game, "c3", "a1-b1", "c2", "b1-a1")  # tiger back on a1: allowed while placing
    assert not game.is_over


def test_invalid_start_position_is_rejected() -> None:
    with pytest.raises(InvalidPosition):
        Game(Position(0, 0, Side.GOAT, 20, 0))


def test_illegal_move_leaves_game_unchanged() -> None:
    game = Game()
    with pytest.raises(IllegalMove):
        game.play(parse_move("a1-a2"))
    with pytest.raises(IllegalMove):
        game.play(Move(None, 12.0))  # type: ignore[arg-type]
    assert game.ply == 0
    assert game.position == Position.initial()


def test_replay_rebuilds_the_same_game() -> None:
    game = Game()
    _play(game, "c3", "a1-b2", "c2", "b2-a1")
    copy = Game.replay(game.moves)
    assert copy.position == game.position
    assert copy.moves == game.moves


def _reference_legal_moves(game: Game) -> set[Move]:
    """Legal moves by brute force: whole history, boards compared regardless of side to move,
    and no clearing on capture."""
    history = [game.start]
    for m in game.moves:
        history.append(apply_unchecked(history[-1], m))
    seen = {(p.tigers, p.goats) for p in history if p.in_hand == 0}
    pos = game.position
    out = set()
    for m in legal_moves(pos):
        after = apply_unchecked(pos, m)
        if after.in_hand > 0 or (after.tigers, after.goats) not in seen:
            out.add(m)
    return out


@given(games())
def test_random_games_are_consistent(game: Game) -> None:
    game.position.validate()
    replayed = Game.replay(game.moves)
    assert replayed.position == game.position
    assert replayed.outcome == game.outcome
    if game.outcome is None:
        assert set(game.legal_moves()) == _reference_legal_moves(game)
        assert game.legal_moves()
    else:
        assert game.legal_moves() == []
        if game.outcome.reason is not Reason.FIVE_CAPTURED:
            assert not _reference_legal_moves(game)
            assert game.outcome.winner is game.position.side.other
