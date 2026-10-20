"""Glicko-2 (Mark Glickman, "Example of the Glicko-2 system", 2012).

Pure functions on the Glicko scale (rating ~1500, deviation, volatility). The platform
updates ratings after every game, treating each game as its own rating period, and widens a
player's deviation for the time they spent not playing.
"""

import math
from dataclasses import dataclass
from typing import Final

SCALE: Final = 173.7178
DEFAULT_RATING: Final = 1500.0
DEFAULT_DEVIATION: Final = 350.0
DEFAULT_VOLATILITY: Final = 0.06
MIN_DEVIATION: Final = 45.0
"""Keeps ratings responsive: a deviation near zero would freeze a rating forever."""
MAX_VOLATILITY: Final = 0.1
TAU: Final = 0.5
"""Constrains how fast volatility changes (Glickman suggests 0.3 to 1.2)."""
_EPSILON: Final = 1e-6


@dataclass(frozen=True, slots=True)
class Rating:
    rating: float = DEFAULT_RATING
    deviation: float = DEFAULT_DEVIATION
    volatility: float = DEFAULT_VOLATILITY


@dataclass(frozen=True, slots=True)
class Result:
    opponent: Rating
    score: float
    """1 for a win, 0 for a loss, 0.5 for a draw (agreed by both players)."""


def _g(phi: float) -> float:
    return 1 / math.sqrt(1 + 3 * phi * phi / (math.pi * math.pi))


def _expected(mu: float, mu_j: float, phi_j: float) -> float:
    return 1 / (1 + math.exp(-_g(phi_j) * (mu - mu_j)))


def idle(player: Rating, periods: float) -> Rating:
    """The rating after ``periods`` rating periods without games: only the deviation grows."""
    if periods <= 0:
        return player
    phi = player.deviation / SCALE
    phi = math.sqrt(phi * phi + periods * player.volatility * player.volatility)
    return Rating(player.rating, min(phi * SCALE, DEFAULT_DEVIATION), player.volatility)


def _new_volatility(phi: float, sigma: float, delta: float, v: float) -> float:
    """Step 5: solve for the new volatility with the Illinois algorithm."""
    a = math.log(sigma * sigma)

    def f(x: float) -> float:
        ex = math.exp(x)
        return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (
            x - a
        ) / (TAU * TAU)

    big_a = a
    if delta * delta > phi * phi + v:
        big_b = math.log(delta * delta - phi * phi - v)
    else:
        # Glickman steps down until f(a - kτ) ≥ 0. Here Δ² ≤ φ² + v, so the first term of
        # f is above -1/2 while the second is k/τ; for τ ≤ 2 (ours is 0.5) the loop never
        # runs. Kept as published in case τ is ever raised.
        k = 1
        while f(a - k * TAU) < 0:  # pragma: no cover - unreachable for TAU <= 2
            k += 1
        big_b = a - k * TAU
    f_a, f_b = f(big_a), f(big_b)
    while abs(big_b - big_a) > _EPSILON:
        big_c = big_a + (big_a - big_b) * f_a / (f_b - f_a)
        f_c = f(big_c)
        if f_c * f_b <= 0:
            big_a, f_a = big_b, f_b
        else:
            f_a /= 2
        big_b, f_b = big_c, f_c
    return math.exp(big_a / 2)


def rate(player: Rating, results: list[Result]) -> Rating:
    """The player's rating after one rating period containing ``results``."""
    if not results:
        return idle(player, 1)
    mu = (player.rating - DEFAULT_RATING) / SCALE
    phi = player.deviation / SCALE
    v_inverse = 0.0
    improvement = 0.0
    for result in results:
        mu_j = (result.opponent.rating - DEFAULT_RATING) / SCALE
        phi_j = result.opponent.deviation / SCALE
        g = _g(phi_j)
        e = _expected(mu, mu_j, phi_j)
        v_inverse += g * g * e * (1 - e)
        improvement += g * (result.score - e)
    v = 1 / v_inverse
    delta = v * improvement
    sigma = min(_new_volatility(phi, player.volatility, delta, v), MAX_VOLATILITY)
    phi_star = math.sqrt(phi * phi + sigma * sigma)
    phi_new = 1 / math.sqrt(1 / (phi_star * phi_star) + 1 / v)
    mu_new = mu + phi_new * phi_new * improvement
    return Rating(
        rating=mu_new * SCALE + DEFAULT_RATING,
        deviation=min(max(phi_new * SCALE, MIN_DEVIATION), DEFAULT_DEVIATION),
        volatility=sigma,
    )
