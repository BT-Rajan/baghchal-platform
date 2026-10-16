import pytest
from hypothesis import given

from baghchal_engine import (
    Game,
    GameOver,
    IllegalMove,
    InvalidPosition,
    Outcome,
    Position,
    Reason,
    Rules,
    Side,
    board_outcome,
    parse_move,
    parse_position,
)

from .conftest import games

TRAPPED = "TGGGT/GG1GG/G1G1G/GG1GG/TGGGT t 3 0"
ONE_FROM_TRAPPED = "TGGGT/GG1GG/G3G/GG1GG/TGGGT g 4 0"
GOATS_STUCK = "GGGGT/GGGGG/GGGGG/TTGGG/1TGGG g 0 0"
SHUFFLE = "TGGGT/GGGGG/GGGGG/1GGG1/T3T g 0 4"


def _play(game: Game, *moves: str) -> Outcome | None:
    outcome = None
    for m in moves:
        outcome = game.play(parse_move(m))
    return outcome


def test_new_game() -> None:
    game = Game()
    assert game.start == Position.initial()
    assert game.rules == Rules()
    assert game.position == Position.initial()
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
    assert board_outcome(parse_position(TRAPPED)) == Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)
    game = Game(parse_position(ONE_FROM_TRAPPED))
    assert _play(game, "c3") == Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)


def test_game_starting_from_a_finished_position_is_already_over() -> None:
    game = Game(parse_position(TRAPPED))
    assert game.outcome == Outcome(Side.GOAT, Reason.TIGERS_TRAPPED)
    with pytest.raises(GameOver):
        game.play(parse_move("a1-b1"))


@pytest.mark.parametrize("winner", [None, Side.TIGER, Side.GOAT])
def test_goat_stalemate_follows_the_rules(winner: Side | None) -> None:
    pos = parse_position(GOATS_STUCK)
    assert board_outcome(pos, Rules(goat_stalemate_winner=winner)) == Outcome(
        winner, Reason.GOATS_STALEMATED
    )


def test_threefold_repetition_is_a_draw() -> None:
    game = Game(parse_position(SHUFFLE))
    cycle = ("d2-d1", "a1-b1", "d1-d2", "b1-a1")
    assert _play(game, *cycle) is None
    assert _play(game, *cycle) == Outcome(None, Reason.REPETITION)
    assert game.ply == 8


def test_repetition_limit_is_configurable() -> None:
    game = Game(parse_position(SHUFFLE), Rules(repetition_limit=2))
    assert _play(game, "d2-d1", "a1-b1", "d1-d2", "b1-a1") == Outcome(None, Reason.REPETITION)


def test_rules_reject_nonsense() -> None:
    with pytest.raises(ValueError, match="repetition_limit"):
        Rules(repetition_limit=1)


def test_invalid_start_position_is_rejected() -> None:
    with pytest.raises(InvalidPosition):
        Game(Position(0, 0, Side.GOAT, 20, 0))


def test_illegal_move_leaves_game_unchanged() -> None:
    game = Game()
    with pytest.raises(IllegalMove):
        game.play(parse_move("a1-a2"))
    assert game.ply == 0
    assert game.position == Position.initial()


def test_replay_rebuilds_the_same_game() -> None:
    game = Game()
    _play(game, "c3", "a1-b2", "c2", "b2-a1")
    copy = Game.replay(game.moves)
    assert copy.position == game.position
    assert copy.moves == game.moves


@given(games())
def test_random_games_are_consistent(game: Game) -> None:
    game.position.validate()
    replayed = Game.replay(game.moves)
    assert replayed.position == game.position
    assert replayed.outcome == game.outcome
    assert game.is_over == (game.outcome is not None)
    if game.outcome is None:
        assert game.legal_moves()
    else:
        assert game.legal_moves() == []
