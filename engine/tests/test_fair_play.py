from baghchal_engine import parse_move
from baghchal_engine.fair_play import LOSS_CAP, Figures, figures
from baghchal_engine.position import Side
from baghchal_engine.review import MoveReview, Verdict, review, verdict


def _move(side: Side, loss: int, margin: int | None) -> MoveReview:
    return MoveReview(
        ply=1,
        side=side,
        move="c3",
        best="c3",
        loss=loss,
        verdict=verdict(loss),
        score=0,
        margin=margin,
    )


def test_figures_count_only_decisive_positions_for_agreement_and_loss() -> None:
    goat = Side.GOAT
    found = figures(
        [
            _move(goat, 0, 500),  # decisive, found
            _move(goat, 300, 500),  # decisive, missed: a mistake
            _move(goat, 5_000, 900),  # decisive, missed badly: capped, a blunder
            _move(goat, 0, 60),  # not decisive (a "good" move's margin)
            _move(goat, 0, None),  # the only legal move
            _move(Side.TIGER, 0, 100),
        ]
    )
    assert found[goat] == Figures(
        moves=5, decisive=3, agreed=1, decisive_loss=300 + LOSS_CAP, mistakes=2, blunders=1
    )
    assert found[Side.TIGER] == Figures(moves=1, decisive=1, agreed=1)
    assert found[goat].agreement == 1 / 3
    assert found[goat].average_loss == (300 + LOSS_CAP) / 3
    assert found[goat].mistake_rate == 2 / 5


def test_figures_add_up_across_games() -> None:
    a = Figures(moves=10, decisive=4, agreed=3, decisive_loss=120, mistakes=1, blunders=0)
    b = Figures(moves=8, decisive=2, agreed=2, decisive_loss=0, mistakes=0, blunders=1)
    assert a + b == Figures(
        moves=18, decisive=6, agreed=5, decisive_loss=120, mistakes=1, blunders=1
    )
    assert sum([a, b], Figures()) == a + b


def test_empty_figures_have_no_rates() -> None:
    empty = Figures()
    assert (empty.agreement, empty.average_loss, empty.mistake_rate) == (0.0, 0.0, 0.0)


def test_figures_from_a_real_review() -> None:
    found = figures(review(parse_move(m) for m in ["b5", "a5xc5"]))
    assert found[Side.GOAT].moves == 1
    assert found[Side.GOAT].blunders == 1  # the goat hung
    assert found[Side.TIGER] == Figures(moves=1, decisive=1, agreed=1)
    assert verdict(found[Side.TIGER].decisive_loss) == Verdict.BEST
