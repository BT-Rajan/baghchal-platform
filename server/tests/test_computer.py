"""Games against the computer."""

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_engine import Game as EngineGame
from baghchal_engine import parse_move
from baghchal_engine.ai import Level
from baghchal_server.deps import AppState
from baghchal_server.errors import AppError
from baghchal_server.games import computer, service, sweeper
from baghchal_server.games.computer import ComputerPlayers

from .conftest import PASSWORD, Clock, Player, PlayerFactory
from .test_billing import give_plan
from .test_games import _online, _start

COMPUTER = "/api/v1/games/computer"


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


@pytest.fixture(autouse=True)
def quick(app: FastAPI) -> None:
    _state(app).computer.think_seconds = (0.0, 0.0)  # no pretend thinking in tests


async def _until(check: Callable[[], Awaitable[bool]], seconds: float = 5) -> None:
    for _ in range(int(seconds / 0.02)):
        if await check():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("timed out")


async def _game(player: Player, game_id: str) -> dict[str, Any]:
    game: dict[str, Any] = (await player.http.get(f"/api/v1/games/{game_id}")).json()
    return game


async def _ply_reaches(player: Player, game_id: str, ply: int) -> None:
    async def check() -> bool:
        return int((await _game(player, game_id))["ply"]) >= ply

    await _until(check)


async def test_the_computer_moves_first_with_the_goats(players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.post(COMPUTER, json={"level": "easy", "side": "tiger"})
    assert r.status_code == 201, r.text
    game = r.json()
    assert game["computer"] == "easy"
    assert game["goat"]["username"] == "computer-easy"
    assert game["rated"] is False
    assert game["time_control"] == "5+3"
    await _ply_reaches(alice, game["id"], 1)


async def test_the_computer_answers_each_move(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    await give_plan(app, alice)  # Hard comes with Plus
    game = (
        await alice.http.post(
            COMPUTER, json={"level": "hard", "side": "goat", "time_control": "3+2"}
        )
    ).json()
    assert game["tiger"]["username"] == "computer-hard"
    for ply in (0, 2, 4):
        current = await _game(alice, game["id"])
        assert current["side_to_move"] == "goat"
        r = await alice.http.post(
            f"/api/v1/games/{game['id']}/moves",
            json={"ply": ply, "move": current["legal_moves"][0]},
        )
        assert r.status_code == 200, r.text
        await _ply_reaches(alice, game["id"], ply + 2)
    final = await _game(alice, game["id"])
    replayed = EngineGame.replay(parse_move(m) for m in final["moves"])
    assert replayed.ply == 6  # every computer move was legal


async def test_one_live_game_at_a_time(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    assert (await alice.http.post(COMPUTER, json={"side": "goat"})).status_code == 201
    r = await alice.http.post(COMPUTER, json={})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        r = await bob.http.post(
            "/api/v1/challenges", json={"opponent": "alice", "time_control": "5+3"}
        )
        assert r.json()["error"]["code"] == "player_busy"
    # The computer plays any number of games at once.
    assert (await bob.http.post(COMPUTER, json={"side": "goat"})).status_code == 201


async def test_requests_are_checked(players: PlayerFactory) -> None:
    alice = await players("alice")
    for body in ({"level": "expert"}, {"side": "both"}, {"time_control": "1+0"}, {"x": 1}):
        assert (await alice.http.post(COMPUTER, json=body)).status_code == 422


async def test_the_computer_cannot_be_found_challenged_or_impersonated(
    app: FastAPI, players: PlayerFactory, client: httpx.AsyncClient
) -> None:
    alice = await players("alice")
    await alice.http.post(COMPUTER, json={"level": "medium", "side": "goat"})
    assert (await alice.http.get("/api/v1/players", params={"prefix": "comp"})).json() == []
    assert (await alice.http.get("/api/v1/players/computer-medium")).status_code == 404
    r = await alice.http.post(
        "/api/v1/challenges", json={"opponent": "computer-medium", "time_control": "5+3"}
    )
    assert r.status_code in {404, 409}
    r = await client.post(
        "/api/v1/auth/register",
        json={"username": "Computer-Pro", "email": "c@example.com", "password": PASSWORD},
    )
    assert r.json()["error"]["code"] == "username_unavailable"


async def test_leaving_the_computer_carries_no_penalty(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    for _ in range(3):
        game = (await alice.http.post(COMPUTER, json={"side": "goat"})).json()
        r = await alice.http.post(f"/api/v1/games/{game['id']}/abort")
        assert r.json()["result"]["reason"] == "aborted"
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)  # no abort cooldown
    assert game["computer"] is None


async def test_a_missed_turn_is_played_by_the_sweeper(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    state = _state(app)
    async with state.sessions() as db:
        bot = await computer.account(db, Level.EASY, clock())
        game = await service.start_computer_game(
            db,
            clock(),
            player_id=uuid.UUID(alice.id),
            computer_id=bot.id,
            level="easy",
            side="tiger",
            initial_seconds=600,
            increment_seconds=5,
        )
    game_id = str(game.id)
    async with state.sessions() as db:
        assert await service.computer_turns_waiting(db, clock()) == []  # not overdue yet
    clock.advance(seconds=4)
    async with state.sessions() as db:
        assert await service.computer_turns_waiting(db, clock()) == [game.id]
    await sweeper.sweep(state)
    await _ply_reaches(alice, game_id, 1)
    async with state.sessions() as db:
        assert await service.computer_turns_waiting(db, clock()) == []  # alice's turn now


async def test_a_turn_is_only_played_when_it_is_the_computers(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    state = _state(app)
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        between_people = await _start(alice, bob)
        assert not await state.computer.play_turn(state, uuid.UUID(between_people["id"]))
        await alice.http.post(f"/api/v1/games/{between_people['id']}/abort")
    game = (await alice.http.post(COMPUTER, json={"side": "goat"})).json()
    gid = uuid.UUID(game["id"])
    assert not await state.computer.play_turn(state, gid)  # alice's move
    await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    assert not await state.computer.play_turn(state, gid)  # over


async def test_a_resignation_while_it_thinks_wins_the_race(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    state = _state(app)
    thinking = asyncio.Event()
    release = asyncio.Event()

    async def slow(moves: list[str], level: Level) -> str:
        thinking.set()
        await release.wait()
        return computer.think(moves, level.value)

    monkeypatch.setattr(state.computer, "_search", slow)
    game = (await alice.http.post(COMPUTER, json={"side": "tiger"})).json()
    await thinking.wait()
    await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    release.set()
    await asyncio.sleep(0.05)
    final = await _game(alice, game["id"])
    assert (final["ply"], final["result"]["reason"]) == (0, "resigned")


async def test_a_failing_turn_is_logged_and_forgotten(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    state = _state(app)
    calls = 0

    async def broken(moves: list[str], level: Level) -> str:
        nonlocal calls
        calls += 1
        raise RuntimeError("engine crashed")

    monkeypatch.setattr(state.computer, "_search", broken)
    game = (await alice.http.post(COMPUTER, json={"side": "tiger"})).json()
    gid = uuid.UUID(game["id"])
    state.computer.schedule(state, gid)  # already scheduled: not twice
    await _until(lambda: _done(state.computer))
    assert calls == 1
    state.computer.schedule(state, gid)  # forgotten after failing, so it can be retried
    await _until(lambda: _done(state.computer))
    assert calls == 2


async def _done(players: ComputerPlayers) -> bool:
    return not players._tasks


async def test_thinking_in_a_separate_process() -> None:
    players = ComputerPlayers(workers=1)
    try:
        move = await players._search([], Level.EASY)
        assert parse_move(move) in EngineGame().legal_moves()
    finally:
        await players.stop()


async def test_the_computer_account_is_made_once(
    app: FastAPI, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _state(app)
    async with state.sessions() as db:
        first = await computer.account(db, Level.HARD, clock())
    async with state.sessions() as db:
        assert (await computer.account(db, Level.HARD, clock())).id == first.id
    # Two servers creating it at once: the loser finds the winner's.
    original = AsyncSession.get
    misses = iter([True])

    async def stale_get(self: AsyncSession, *args: Any, **kwargs: Any) -> Any:
        if next(misses, False):
            return None
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "get", stale_get)
    async with state.sessions() as db:
        assert (await computer.account(db, Level.HARD, clock())).id == first.id


async def test_starting_two_games_at_once(
    app: FastAPI, players: PlayerFactory, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    await alice.http.post(COMPUTER, json={"side": "goat"})

    async def nobody_busy(db: object, ids: object) -> set[object]:
        return set()  # as if the other request had not committed yet

    monkeypatch.setattr(service, "busy", nobody_busy)
    r = await alice.http.post(COMPUTER, json={"side": "goat"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")


async def test_an_error_while_playing_is_reported_not_raised(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def refuse(*args: object, **kwargs: object) -> None:
        raise AppError(409, "stale_position", "moved on")

    alice = await players("alice")
    state = _state(app)
    monkeypatch.setattr(service, "play", refuse)
    game = (await alice.http.post(COMPUTER, json={"side": "tiger"})).json()
    await _until(lambda: _done(state.computer))
    assert (await _game(alice, game["id"]))["ply"] == 0


async def test_a_random_side(players: PlayerFactory) -> None:
    alice = await players("alice")
    game = (await alice.http.post(COMPUTER, json={})).json()  # side: random by default
    assert alice.username in {game["goat"]["username"], game["tiger"]["username"]}


async def test_the_computer_pauses_like_a_person(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    _state(app).computer.think_seconds = (0.2, 0.2)
    game = (await alice.http.post(COMPUTER, json={"side": "tiger"})).json()
    await asyncio.sleep(0.1)
    assert (await _game(alice, game["id"]))["ply"] == 0  # still "thinking"
    await _ply_reaches(alice, game["id"], 1)


async def test_stopping_cancels_a_turn_in_progress(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    state = _state(app)
    thinking = asyncio.Event()

    async def forever(moves: list[str], level: Level) -> str:
        thinking.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    monkeypatch.setattr(state.computer, "_search", forever)
    await alice.http.post(COMPUTER, json={"side": "tiger"})
    await thinking.wait()
    await state.computer.stop()
    assert await _done(state.computer)
