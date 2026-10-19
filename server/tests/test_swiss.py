"""Swiss pairing on its own."""

import uuid

from baghchal_server.tournaments.swiss import Record, pair, rounds_for


def _ids(n: int) -> list[uuid.UUID]:
    return [uuid.UUID(int=i + 1) for i in range(n)]


def test_how_many_rounds() -> None:
    assert [rounds_for(n) for n in (2, 3, 4, 5, 8, 16, 32)] == [1, 2, 3, 4, 4, 5, 6]


def test_the_first_round_by_rating() -> None:
    a, b, c, d = _ids(4)
    records = [Record(a, 0, 1500), Record(b, 0, 1700), Record(c, 0, 1600), Record(d, 0, 1400)]
    pairs, bye = pair(records)
    # Ranked b, c, a, d: each with the nearest still free.
    assert (pairs, bye) == ([(b, c), (a, d)], None)


def test_scores_first_and_no_repeats() -> None:
    a, b, c, d = _ids(4)
    records = [
        Record(a, 1, 1500, opponents={b}, goats=1, last_side="goat"),
        Record(b, 0, 1500, opponents={a}, tigers=1, last_side="tiger"),
        Record(c, 1, 1500, opponents={d}, tigers=1, last_side="tiger"),
        Record(d, 0, 1500, opponents={c}, goats=1, last_side="goat"),
    ]
    pairs, _ = pair(records)
    # The two winners meet, and the two losers; the side each has played less is theirs now.
    assert sorted(pairs) == sorted([(c, a), (b, d)])


def test_a_repeat_only_when_there_is_no_other_way() -> None:
    a, b = _ids(2)
    records = [Record(a, 1, 1500, opponents={b}), Record(b, 0, 1500, opponents={a})]
    assert pair(records) == ([(a, b)], None)


def test_backtracking_avoids_a_dead_end() -> None:
    a, b, c, d = _ids(4)
    # a has met c; pairing a-b first would leave c-d, who have met: so a-d, b-c.
    records = [
        Record(a, 2, 1500, opponents={c}),
        Record(b, 2, 1400, opponents={d}),
        Record(c, 1, 1500, opponents={a, d}),
        Record(d, 1, 1400, opponents={b, c}),
    ]
    pairs, _ = pair(records)
    assert {frozenset(p) for p in pairs} == {frozenset((a, d)), frozenset((b, c))}


def test_byes_go_to_the_lowest_who_has_had_none() -> None:
    a, b, c = _ids(3)
    records = [Record(a, 2, 1500), Record(b, 1, 1500), Record(c, 0, 1500, had_bye=True)]
    _, bye = pair(records)
    assert bye == b
    everyone = [Record(i, 0, 1500, had_bye=True) for i in (a, b, c)]
    assert pair(everyone)[1] == c  # all have had one: the lowest again


def test_sides_alternate() -> None:
    a, b = _ids(2)
    # Equal balance: whoever last played tigers gets the goats.
    left = Record(a, 0, 1600, goats=1, tigers=1, last_side="goat")
    right = Record(b, 0, 1500, goats=1, tigers=1, last_side="tiger")
    assert pair([left, right])[0] == [(b, a)]
    assert pair([Record(a, 0, 1600), Record(b, 0, 1500)])[0] == [(a, b)]  # new: higher-ranked
