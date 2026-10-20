"""Swiss pairing, as in chess, for a game with two different sides.

A Swiss tournament has a set number of rounds. Each round, players are ranked by score (then
by rating) and paired with someone on the same score or as close as possible, never with an
opponent they have already met if it can be avoided. With an odd number of players, the
lowest-ranked player who has not yet had a bye sits the round out and scores a point. Each
pairing is one game; sides alternate, so the player who has played goats less gets the goats.
"""

import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field


@dataclass(slots=True)
class Record:
    """Where a player stands before a round."""

    id: uuid.UUID
    score: float
    """1 per win and per bye, 0.5 per draw."""
    rating: float
    opponents: set[uuid.UUID] = field(default_factory=set)
    goats: int = 0
    tigers: int = 0
    last_side: str | None = None
    """``goat`` or ``tiger``: the side of their latest game."""
    had_bye: bool = False


def rounds_for(players: int) -> int:
    """Enough rounds to find a clear winner, but no more than everyone meeting everyone."""
    return max(1, min(players - 1, math.ceil(math.log2(players)) + 1))


def _ranked(records: Sequence[Record]) -> list[Record]:
    return sorted(records, key=lambda r: (-r.score, -r.rating, str(r.id)))


def _match(order: list[Record], *, repeats: bool) -> list[tuple[Record, Record]] | None:
    """Pair everyone, each with the nearest-ranked player still free; backtrack if stuck."""
    if not order:
        return []
    first, rest = order[0], order[1:]
    for i, other in enumerate(rest):
        if not repeats and other.id in first.opponents:
            continue
        found = _match(rest[:i] + rest[i + 1 :], repeats=repeats)
        if found is not None:
            return [(first, other), *found]
    return None


def _sides(a: Record, b: Record) -> tuple[uuid.UUID, uuid.UUID]:
    """(goat, tiger): goats to whoever has played them less; then to whoever last played
    tigers; then to the higher-ranked player (``a``)."""
    balance_a, balance_b = a.goats - a.tigers, b.goats - b.tigers
    if balance_a != balance_b:
        return (a.id, b.id) if balance_a < balance_b else (b.id, a.id)
    if a.last_side != b.last_side and "tiger" in (a.last_side, b.last_side):
        return (a.id, b.id) if a.last_side == "tiger" else (b.id, a.id)
    return a.id, b.id


def pair(records: Sequence[Record]) -> tuple[list[tuple[uuid.UUID, uuid.UUID]], uuid.UUID | None]:
    """The next round: (goat, tiger) pairs, and who has the bye (if anyone)."""
    order = _ranked(records)
    bye = None
    if len(order) % 2 == 1:
        sitting = next((r for r in reversed(order) if not r.had_bye), order[-1])
        order.remove(sitting)
        bye = sitting.id
    pairs = _match(order, repeats=False) or _match(order, repeats=True) or []
    return [_sides(a, b) for a, b in pairs], bye
