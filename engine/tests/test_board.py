from baghchal_engine.board import (
    ALL_POINTS,
    JUMPS,
    NEIGHBOUR_MASK,
    NEIGHBOURS,
    NUM_POINTS,
    file_of,
    iter_points,
    point,
    rank_of,
)

from . import reference


def _p(c: tuple[int, int]) -> int:
    return point(*c)


def test_adjacency_matches_drawn_lines() -> None:
    expected = {(_p(a), _p(b)) for a, b in reference.STEPS}
    actual = {(a, b) for a in range(NUM_POINTS) for b in NEIGHBOURS[a]}
    assert actual == expected


def test_jumps_match_drawn_lines() -> None:
    expected = {(_p(a), _p(b), _p(c)) for a, b, c in reference.JUMPS}
    actual = {(a, over, land) for a in range(NUM_POINTS) for over, land in JUMPS[a]}
    assert actual == expected


def test_edge_count() -> None:
    # 40 orthogonal edges plus 16 diagonal edges, each counted from both ends.
    assert sum(len(n) for n in NEIGHBOURS) == 2 * 56


def test_adjacency_is_symmetric_and_masks_agree() -> None:
    for a in range(NUM_POINTS):
        assert NEIGHBOUR_MASK[a] == sum(1 << b for b in NEIGHBOURS[a])
        for b in NEIGHBOURS[a]:
            assert a in NEIGHBOURS[b]


def test_coordinates_round_trip() -> None:
    for p in range(NUM_POINTS):
        assert point(file_of(p), rank_of(p)) == p


def test_iter_points() -> None:
    assert iter_points(0) == []
    assert iter_points(ALL_POINTS) == list(range(NUM_POINTS))
    assert iter_points(1 | 1 << 24 | 1 << 12) == [0, 12, 24]
