import random

import pytest

from baghchal_engine import Game, GameOver, Move, Side, ai, has_legal_move, parse_position
from baghchal_engine.ai import LEVELS, WIN, Level, choose_move, evaluate

# Positions are BFEN: ranks 5 to 1, side to move, goats in hand, goats captured.
START = "T3T/5/5/5/T3T g 20 0"
FINISHED = "T3T/5/5/5/T3T g 15 5"
# Every point filled but c4: no tiger can step or jump, so the tigers are trapped.
BOXED = "TGGGT/GG1GG/GGGGG/GGGGG/TGGGT t 0 0"


def test_evaluation_counts_captures_mobility_and_hanging_goats() -> None:
    # Four corner tigers with three steps each, nothing to take.
    assert evaluate(parse_position(START)) == 4 * 3 * ai.MOBILITY
    # A goat on c3 is safe; one on b2 can be jumped from a1 (to the empty c3).
    safe = parse_position("T3T/5/2G2/5/T3T t 19 0")
    hanging = parse_position("T3T/5/5/1G3/T3T t 19 0")
    assert evaluate(hanging) - evaluate(safe) == ai.HANGING
    assert evaluate(parse_position(FINISHED)) == WIN
    one_taken = parse_position("T3T/5/5/5/T3T t 19 1")
    assert evaluate(one_taken) == ai.CAPTURED + 4 * 3 * ai.MOBILITY


def test_trapped_tigers_count_against_the_tigers() -> None:
    assert not has_legal_move(parse_position(BOXED))
    assert evaluate(parse_position(BOXED)) == -4 * ai.TRAPPED


@pytest.mark.parametrize("level", list(Level))
def test_every_level_plays_legal_moves_through_a_game(level: Level) -> None:
    rng = random.Random(7)
    game = Game()
    while not game.is_over and game.ply < 80:
        move = choose_move(game, level, rng=rng)
        assert move in game.legal_moves()
        game.play(move)


def test_a_finished_game_has_no_move() -> None:
    with pytest.raises(GameOver):
        choose_move(Game(parse_position(FINISHED)))


def test_the_only_move_is_played_without_searching() -> None:
    class OneMove(Game):
        __slots__ = ()

        def legal_moves(self) -> list[Move]:
            return [Move(None, 12)]

    assert choose_move(OneMove(), Level.HARD) == Move(None, 12)


def test_the_strong_player_takes_the_winning_capture() -> None:
    # Four goats taken; the a1 tiger can jump b2 to c3 for the fifth.
    game = Game(parse_position("T3T/5/5/1G3/T3T t 15 4"))
    game.play(choose_move(game, Level.HARD, rng=random.Random(1)))
    assert game.outcome is not None
    assert game.outcome.winner is Side.TIGER


@pytest.mark.parametrize("seed", range(4))
def test_careful_goats_do_not_leave_a_goat_to_be_taken(seed: int) -> None:
    game = Game(parse_position(START))
    game.play(choose_move(game, Level.HARD, rng=random.Random(seed)))
    assert not any(m.is_capture for m in game.legal_moves())


def test_easy_spreads_its_choices() -> None:
    game = Game()
    picks = {choose_move(game, Level.EASY, rng=random.Random(seed)) for seed in range(40)}
    assert len(picks) > 3


def test_easy_sometimes_plays_a_random_move(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(LEVELS, Level.EASY, LEVELS[Level.EASY]._replace(blunder=1.0))
    game = Game()
    assert choose_move(game, Level.EASY, rng=random.Random(3)) in game.legal_moves()


def test_the_search_stops_on_time(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(LEVELS, Level.HARD, LEVELS[Level.HARD]._replace(depth=30, seconds=0.0))
    game = Game(parse_position(START))
    assert choose_move(game, Level.HARD, rng=random.Random(2)) in game.legal_moves()


def test_the_search_scores_lost_positions_as_losses() -> None:
    search = ai._Search(deadline=float("inf"))
    assert search.negamax(parse_position(BOXED), 2, -WIN * 2, WIN * 2) == -WIN - 2
    assert search.negamax(parse_position(FINISHED), 2, -WIN * 2, WIN * 2) == -WIN - 2
