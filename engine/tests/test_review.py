import pytest

from baghchal_engine import Game, IllegalMove, parse_move
from baghchal_engine.position import Side
from baghchal_engine.review import SCORE_LIMIT, Verdict, review, unique_best, verdict

# The tigers take five goats; every goat move hands one over.
FIVE_CAPTURES = ["b2", "a1xc3", "e2", "e1xe3", "c4", "c3xc5", "b4", "c5xa3", "b2", "a3xc1"]


def _review(moves: list[str], **kwargs: object) -> list:  # type: ignore[type-arg]
    return review((parse_move(m) for m in moves), **kwargs)  # type: ignore[arg-type]


def test_verdicts_by_loss() -> None:
    assert [verdict(n) for n in (0, 1, 60, 61, 200, 201, 700, 701, 5000)] == [
        Verdict.BEST,
        Verdict.GOOD,
        Verdict.GOOD,
        Verdict.INACCURACY,
        Verdict.INACCURACY,
        Verdict.MISTAKE,
        Verdict.MISTAKE,
        Verdict.BLUNDER,
        Verdict.BLUNDER,
    ]


def test_a_goat_given_away_and_taken() -> None:
    first, second = _review(["b5", "a5xc5"])
    assert (first.ply, first.side, first.move) == (1, Side.GOAT, "b5")
    assert first.verdict is Verdict.BLUNDER  # it hangs at once
    assert first.best != "b5"
    assert first.loss > 700
    assert (second.side, second.move, second.best) == (Side.TIGER, "a5xc5", "a5xc5")
    assert (second.verdict, second.loss) == (Verdict.BEST, 0)
    assert second.score > first.score  # the tigers are better off once it hangs


def test_a_lost_game_is_scored_at_the_limit() -> None:
    reviews = _review(FIVE_CAPTURES)
    assert len(reviews) == len(FIVE_CAPTURES)
    assert (reviews[-1].verdict, reviews[-1].score) == (Verdict.BEST, SCORE_LIMIT)  # it wins
    assert all(-SCORE_LIMIT <= r.score <= SCORE_LIMIT for r in reviews)


def test_out_of_time_still_reviews() -> None:
    (only,) = _review(["c3"], seconds=0)
    assert only.move == "c3"


def test_an_illegal_move_is_refused() -> None:
    with pytest.raises(IllegalMove, match="move 3 is not legal: c3-c2"):
        _review(["c3", "a5-a4", "c3-c2"])  # goats cannot move while some are still in hand


def test_a_puzzle_has_one_clearly_best_move() -> None:
    game = Game()
    assert unique_best(game) is None  # the first goat can go almost anywhere
    game.play(parse_move("b5"))
    assert unique_best(game) == parse_move("a5xc5")  # the goat hangs: take it


def test_margins_tell_decisive_positions_apart() -> None:
    first, second = _review(["b5", "a5xc5"])
    assert first.margin is not None
    assert first.margin <= 60  # many first goats are as good as each other
    assert second.margin is not None
    assert second.margin > 700  # taking the hanging goat is the one right answer


def test_one_sides_moves_only() -> None:
    tigers = _review(FIVE_CAPTURES, only=Side.TIGER)
    assert [r.ply for r in tigers] == [2, 4, 6, 8, 10]
    assert all(r.side is Side.TIGER for r in tigers)
    with pytest.raises(IllegalMove, match="move 3 is not legal"):
        _review(["c3", "a5-a4", "c3-c2"], only=Side.TIGER)
