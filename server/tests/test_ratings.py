import asyncio
import math
import os
import sqlite3
import subprocess
import sys
import uuid
from contextlib import AsyncExitStack, closing
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx_ws import AsyncWebSocketSession
from sqlalchemy import update

from baghchal_server.accounts.models import User
from baghchal_server.ratings import glicko2
from baghchal_server.ratings.glicko2 import Rating, Result, idle, rate
from baghchal_server.ratings.models import PlayerRating

from .conftest import SERVER_DIR, Clock, Player, PlayerFactory, open_socket

FIVE_CAPTURES = ["b2", "a1xc3", "e2", "e1xe3", "c4", "c3xc5", "b4", "c5xa3", "b2", "a3xc1"]


# ── Glicko-2 ──────────────────────────────────────────────────────────────


def test_glickmans_worked_example() -> None:
    """Glickman, "Example of the Glicko-2 system" (2012), section 3."""
    player = Rating(1500, 200, 0.06)
    after = rate(
        player,
        [
            Result(Rating(1400, 30), 1),
            Result(Rating(1550, 100), 0),
            Result(Rating(1700, 300), 0),
        ],
    )
    assert after.rating == pytest.approx(1464.05, abs=0.01)
    assert after.deviation == pytest.approx(151.52, abs=0.01)
    assert after.volatility == pytest.approx(0.05999, abs=1e-5)


def test_equal_players_trade_equal_points() -> None:
    a, b = Rating(), Rating()
    winner = rate(a, [Result(b, 1)])
    loser = rate(b, [Result(a, 0)])
    assert winner.rating - 1500 == pytest.approx(1500 - loser.rating)
    assert winner.rating > 1500 > loser.rating
    assert winner.deviation < 350


def test_an_upset_moves_ratings_more_than_an_expected_result() -> None:
    weak, strong = Rating(1300, 60), Rating(1900, 60)
    upset = rate(weak, [Result(strong, 1)]).rating - weak.rating
    expected = rate(strong, [Result(weak, 1)]).rating - strong.rating
    assert upset > 10 * expected > 0


def test_volatility_reacts_to_surprising_results() -> None:
    # A long run of wins against much stronger players exercises the Illinois search's
    # first bracket (delta² > phi² + v); routine results take the other branch.
    settled = Rating(1500, 50, 0.06)
    surprised = rate(settled, [Result(Rating(2400, 50), 1)] * 5)
    assert surprised.volatility > settled.volatility
    assert surprised.volatility <= glicko2.MAX_VOLATILITY


def test_deviation_bounds() -> None:
    very_sure = rate(Rating(1500, 45, 0.03), [Result(Rating(1500, 45), 1)] * 50)
    assert very_sure.deviation == glicko2.MIN_DEVIATION
    assert idle(Rating(1500, 300), 10_000).deviation == glicko2.DEFAULT_DEVIATION


def test_idle_time_only_widens_the_deviation() -> None:
    player = Rating(1720, 80, 0.06)
    later = idle(player, 100)
    assert (later.rating, later.volatility) == (1720, 0.06)
    assert later.deviation > 80
    assert idle(player, 0) == player
    assert rate(player, []) == idle(player, 1)


# ── Rated matches ─────────────────────────────────────────────────────────


async def _next_game(ws: AsyncWebSocketSession) -> dict[str, Any]:
    while True:
        message: dict[str, Any] = await asyncio.wait_for(ws.receive_json(), timeout=2)
        if message["type"] == "game":
            game: dict[str, Any] = message["game"]
            return game


async def _accepted(challenger: Player, opponent: Player, **options: object) -> dict[str, Any]:
    r = await challenger.http.post(
        "/api/v1/challenges",
        json={"opponent": opponent.username, "time_control": "5+3", **options},
    )
    assert r.status_code == 201, r.text
    r = await opponent.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
    assert r.status_code == 200, r.text
    game: dict[str, Any] = (await opponent.http.get(f"/api/v1/games/{r.json()['game_id']}")).json()
    return game


async def _play(
    players: dict[str, Player], game: dict[str, Any], moves: list[str]
) -> dict[str, Any]:
    for move in moves:
        mover = players[game[game["side_to_move"]]["id"]]
        r = await mover.http.post(
            f"/api/v1/games/{game['id']}/moves", json={"ply": game["ply"], "move": move}
        )
        assert r.status_code == 200, r.text
        game = r.json()
    return game


async def _profile(viewer: Player, username: str) -> dict[str, Any]:
    profile: dict[str, Any] = (await viewer.http.get(f"/api/v1/players/{username}")).json()
    return profile


async def test_a_rated_match(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    by_id = {alice.id: alice, bob.id: bob}
    async with AsyncExitStack() as stack:
        alice_ws = await stack.enter_async_context(open_socket(app, alice.auth))
        bob_ws = await stack.enter_async_context(open_socket(app, bob.auth))
        game1 = await _accepted(alice, bob, rated=True)
        assert game1["rated"] is True
        assert game1["match"]["game"] == 1
        assert game1["ratings"] == {
            "goat": {"rating": 1500, "change": None},
            "tiger": {"rating": 1500, "change": None},
        }
        first_goat, first_tiger = game1["goat"]["id"], game1["tiger"]["id"]

        game1 = await _play(by_id, game1, FIVE_CAPTURES)  # tigers win game 1
        assert game1["result"] == {"winner": "tiger", "reason": "five_captured"}
        gain, loss = game1["ratings"]["tiger"]["change"], game1["ratings"]["goat"]["change"]
        assert gain > 0 > loss
        assert gain == -loss  # equal players, equal stakes

        # Both players see game 1 end, then game 2 start with sides swapped.
        for ws in (alice_ws, bob_ws):
            seen = await _next_game(ws)
            while seen["id"] != game1["id"] or seen["status"] != "finished":
                seen = await _next_game(ws)
            game2 = await _next_game(ws)
            assert game2["match"]["game"] == 2
            assert (game2["goat"]["id"], game2["tiger"]["id"]) == (first_tiger, first_goat)
            assert game2["status"] == "active"
        assert game2["match"]["games"] == [game1["id"], game2["id"]]
        assert {s["player"]["id"]: s["points"] for s in game2["match"]["score"]} == {
            first_tiger: 1,
            first_goat: 0,
        }
        # Game 2 shows the ratings as game 1 left them.
        assert game2["ratings"]["tiger"]["rating"] == 1500 + loss
        assert game2["ratings"]["goat"]["rating"] == 1500 + gain

        game2 = await _play(by_id, game2, FIVE_CAPTURES)  # tigers win again: 1-1
        assert {s["points"] for s in game2["match"]["score"]} == {1}
        # No third game.
        assert (await alice.http.get("/api/v1/games")).json() == []

    for player in (alice, bob):
        rating = (await _profile(alice, player.username))["ratings"]["blitz"]
        assert rating["games"] == 2
        assert rating["provisional"] is True
        assert rating["rank"] is None
        assert (await _profile(alice, player.username))["ratings"]["rapid"]["games"] == 0


async def test_casual_games_do_not_change_ratings(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(open_socket(app, bob.auth))
        game = await _accepted(alice, bob, side="goat")
        assert game["match"] is None
        game = await _play({alice.id: alice, bob.id: bob}, game, FIVE_CAPTURES)
    assert game["ratings"]["goat"]["change"] is None
    assert game["ratings"]["tiger"]["change"] is None
    assert (await _profile(alice, "alice"))["ratings"]["blitz"]["games"] == 0
    assert (await alice.http.get("/api/v1/games")).json() == []


async def test_an_aborted_first_game_ends_the_match(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(open_socket(app, bob.auth))
        game = await _accepted(alice, bob, rated=True)
    r = await alice.http.post(f"/api/v1/games/{game['id']}/abort")
    assert r.json()["result"] == {"winner": None, "reason": "aborted"}
    assert r.json()["match"]["games"] == [game["id"]]
    assert r.json()["ratings"]["goat"]["change"] is None
    assert (await alice.http.get("/api/v1/games")).json() == []


async def test_an_aborted_second_game_keeps_the_first_result(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    by_id = {alice.id: alice, bob.id: bob}
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(open_socket(app, bob.auth))
        game1 = await _accepted(alice, bob, rated=True)
    game1 = await _play(by_id, game1, FIVE_CAPTURES)
    game2_id = game1["match"]["games"][1] if len(game1["match"]["games"]) > 1 else None
    if game2_id is None:  # the response was built just before game 2 existed
        game2_id = (await alice.http.get("/api/v1/games")).json()[0]["id"]
    r = await bob.http.post(f"/api/v1/games/{game2_id}/abort")
    assert r.json()["result"]["reason"] == "aborted"
    assert (await alice.http.get("/api/v1/games")).json() == []
    assert (await _profile(alice, "alice"))["ratings"]["blitz"]["games"] == 1


async def test_time_controls_have_separate_ratings(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(open_socket(app, bob.auth))
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "10+5", "rated": True}
        )
        game = (await bob.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")).json()
    game = (await alice.http.get(f"/api/v1/games/{game['game_id']}")).json()
    await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    ratings = (await _profile(alice, "alice"))["ratings"]
    assert ratings["rapid"]["games"] == 1
    assert ratings["rapid"]["rating"] < 1500
    assert ratings["blitz"] == {
        "rating": 1500,
        "deviation": 350,
        "games": 0,
        "provisional": True,
        "rank": None,
    }


async def test_deviation_grows_while_away(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(open_socket(app, bob.auth))
        game = await _accepted(alice, bob, rated=True)
    await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    before = (await _profile(bob, "alice"))["ratings"]["blitz"]
    clock.advance(days=25)  # within the 30-day session
    after = (await _profile(bob, "alice"))["ratings"]["blitz"]
    assert after["rating"] == before["rating"]
    assert after["deviation"] > before["deviation"]


# ── Leaderboards ──────────────────────────────────────────────────────────


async def _set_rating(
    app: FastAPI, player: Player, category: str, *, rating: float, deviation: float, age: timedelta
) -> None:
    state = app.state.ctx
    async with state.sessions() as db:
        db.add(
            PlayerRating(
                user_id=uuid.UUID(player.id),
                category=category,
                rating=rating,
                deviation=deviation,
                volatility=0.06,
                games=40,
                updated_at=state.clock() - age,
            )
        )
        await db.commit()


async def test_leaderboard(app: FastAPI, players: PlayerFactory) -> None:
    people = {name: await players(name) for name in ("ann", "ben", "cat", "dan", "eve", "fay")}
    day = timedelta(days=1)
    await _set_rating(app, people["ann"], "blitz", rating=1810, deviation=60, age=day)
    await _set_rating(app, people["ben"], "blitz", rating=1950, deviation=70, age=day)
    await _set_rating(
        app, people["cat"], "blitz", rating=1810, deviation=80, age=day
    )  # ties ann: by name
    await _set_rating(
        app, people["dan"], "blitz", rating=2100, deviation=150, age=day
    )  # provisional
    await _set_rating(
        app, people["eve"], "blitz", rating=2200, deviation=60, age=31 * day
    )  # inactive
    await _set_rating(
        app, people["fay"], "rapid", rating=2000, deviation=60, age=day
    )  # other category
    viewer = people["ann"]

    r = await viewer.http.get("/api/v1/leaderboards/blitz")
    assert r.status_code == 200
    board = [(e["rank"], e["player"]["username"], e["rating"]) for e in r.json()]
    assert board == [(1, "ben", 1950), (2, "ann", 1810), (3, "cat", 1810)]
    assert len((await viewer.http.get("/api/v1/leaderboards/blitz?limit=1")).json()) == 1
    assert [
        e["player"]["username"]
        for e in (await viewer.http.get("/api/v1/leaderboards/rapid")).json()
    ] == ["fay"]

    assert (await _profile(viewer, "ben"))["ratings"]["blitz"]["rank"] == 1
    assert (await _profile(viewer, "cat"))["ratings"]["blitz"]["rank"] == 2  # tied: shares 2nd
    assert (await _profile(viewer, "dan"))["ratings"]["blitz"]["rank"] is None
    assert (await _profile(viewer, "eve"))["ratings"]["blitz"]["rank"] is None

    async with app.state.ctx.sessions() as db:
        await db.execute(update(User).where(User.username == "ben").values(is_active=False))
        await db.commit()
    names = [
        e["player"]["username"]
        for e in (await viewer.http.get("/api/v1/leaderboards/blitz")).json()
    ]
    assert names == ["ann", "cat"]


async def test_leaderboard_requests_are_checked(
    app_client: httpx.AsyncClient, players: PlayerFactory
) -> None:
    assert (await app_client.get("/api/v1/leaderboards/blitz")).status_code == 401
    alice = await players("alice")
    assert (await alice.http.get("/api/v1/leaderboards/bullet")).status_code == 422
    assert (await alice.http.get("/api/v1/leaderboards/blitz?limit=101")).status_code == 422


# ── Migration with existing data ──────────────────────────────────────────


def test_migration_0004_keeps_existing_games(tmp_path: Path) -> None:
    db = tmp_path / "upgrade.db"
    env = {**os.environ, "BAGHCHAL_DATABASE_URL": f"sqlite+aiosqlite:///{db}"}

    def alembic(*args: str) -> None:
        subprocess.run(  # noqa: S603 - fixed command line
            [sys.executable, "-m", "alembic", *args],
            cwd=SERVER_DIR,
            env=env,
            check=True,
            capture_output=True,
        )

    alembic("upgrade", "0003")
    ts = "2026-01-01 00:00:00.000000"
    with closing(sqlite3.connect(db)) as conn, conn:
        for uid, name in (("a" * 32, "alice"), ("b" * 32, "bob")):
            conn.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, ?, 'x', ?, 1, ?, ?)",
                (uid, name, name, f"{name}@example.com", f"{name}@example.com", ts, ts, ts),
            )
        conn.execute(
            "INSERT INTO challenges VALUES (?, ?, ?, NULL, 300, 3, 0, 'goat', 'accepted', ?, ?, ?)",
            ("c" * 32, "a" * 32, "b" * 32, ts, ts, ts),
        )
        conn.execute(
            "INSERT INTO games (id, challenge_id, goat_id, tiger_id, rated, initial_ms,"
            " increment_ms, status, ply, position, goat_ms, tiger_ms, turn_started_at, created_at)"
            " VALUES (?, ?, ?, ?, 0, 300000, 3000, 'active', 0, 'T3T/5/5/5/T3T g 20 0',"
            " 300000, 300000, ?, ?)",
            ("d" * 32, "c" * 32, "a" * 32, "b" * 32, ts, ts),
        )
    alembic("upgrade", "head")
    with closing(sqlite3.connect(db)) as conn, conn:
        row = conn.execute("SELECT goat_rating, tiger_rating, match_id FROM games").fetchone()
    assert row == (1500, 1500, None)
    alembic("downgrade", "0003")
    with closing(sqlite3.connect(db)) as conn, conn:
        assert conn.execute("SELECT count(*) FROM games").fetchone() == (1,)


def test_volatility_solver_solves_its_equation() -> None:
    """Step 5 from both starting brackets (Δ² above and below φ² + v): the answer must solve
    f(x) = 0."""
    phi, v, sigma = 0.5, 1.0, 0.06
    for delta in (3.0, 0.1):
        new = glicko2._new_volatility(phi, sigma, delta, v)
        a, x = math.log(sigma * sigma), math.log(new * new)
        ex = math.exp(x)
        f = (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (
            x - a
        ) / (glicko2.TAU * glicko2.TAU)
        assert abs(f) < 1e-5
