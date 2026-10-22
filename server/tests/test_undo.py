"""Taking moves back: at once against the computer, by asking against a person; only in casual
games, and a few times a game."""

import asyncio
from contextlib import AsyncExitStack
from typing import Any

import httpx
from fastapi import FastAPI

from baghchal_server.deps import AppState
from baghchal_server.games.service import UNDO_LIMIT

from .conftest import Player, PlayerFactory
from .test_draws import _moves
from .test_games import _event, _online, _start
from .test_tournaments import URL, _get, _host, _start_pairing

COMPUTER = "/api/v1/games/computer"


def _undo(player: Player, game: dict[str, Any], answer: str = "") -> Any:
    return player.http.post(f"/api/v1/games/{game['id']}/undo" + (f"/{answer}" if answer else ""))


def _code(r: httpx.Response) -> str:
    return r.json()["error"]["code"]  # type: ignore[no-any-return]


async def _game(player: Player, game: dict[str, Any]) -> dict[str, Any]:
    return (await player.http.get(f"/api/v1/games/{game['id']}")).json()  # type: ignore[no-any-return]


async def _until_ply(player: Player, game: dict[str, Any], ply: int) -> dict[str, Any]:
    for _ in range(250):
        seen = await _game(player, game)
        if seen["ply"] >= ply:
            return seen
        await asyncio.sleep(0.02)
    raise AssertionError("the computer did not move")


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


# ── Against the computer ──────────────────────────────────────────────────


async def test_undo_against_the_computer(app: FastAPI, players: PlayerFactory) -> None:
    _state(app).computer.think_seconds = (0.0, 0.0)
    alice = await players("alice")
    game = (await alice.http.post(COMPUTER, json={"level": "easy", "side": "goat"})).json()
    assert (game["undo"], game["takeback_offer"]) == ("none", None)
    assert _code(await _undo(alice, game)) == "no_undo"  # nothing to take back yet

    first = game["legal_moves"][0]
    r = await alice.http.post(f"/api/v1/games/{game['id']}/moves", json={"ply": 0, "move": first})
    assert r.status_code == 200, r.text
    game = await _until_ply(alice, game, 2)
    assert game["undo"] == "now"
    # My move and the computer's reply go; it is my turn again, on the starting board.
    r = await _undo(alice, game)
    assert r.status_code == 200, r.text
    game = r.json()
    assert (game["ply"], game["moves"], game["side_to_move"]) == (0, [], "goat")
    assert game["undo"] == "none"
    assert game["status"] == "active"


async def test_undo_before_the_computer_replies(app: FastAPI, players: PlayerFactory) -> None:
    """Only my move goes; the reply the computer was working out is never played on the board
    after the takeback."""
    _state(app).computer.think_seconds = (0.3, 0.3)
    alice = await players("alice")
    game = (await alice.http.post(COMPUTER, json={"level": "easy", "side": "goat"})).json()
    moves = game["legal_moves"]
    r = await alice.http.post(
        f"/api/v1/games/{game['id']}/moves", json={"ply": 0, "move": moves[0]}
    )
    game = r.json()
    assert (game["ply"], game["undo"]) == (1, "now")
    game = (await _undo(alice, game)).json()
    assert game["ply"] == 0
    r = await alice.http.post(
        f"/api/v1/games/{game['id']}/moves", json={"ply": 0, "move": moves[-1]}
    )
    assert r.status_code == 200, r.text
    game = await _until_ply(alice, game, 2)
    assert game["moves"][0] == moves[-1]
    assert len(game["moves"]) == 2


async def test_three_undos_a_game(app: FastAPI, players: PlayerFactory) -> None:
    _state(app).computer.think_seconds = (0.0, 0.0)
    alice = await players("alice")
    game = (await alice.http.post(COMPUTER, json={"level": "easy", "side": "goat"})).json()
    for _ in range(UNDO_LIMIT):
        r = await alice.http.post(
            f"/api/v1/games/{game['id']}/moves", json={"ply": 0, "move": game["legal_moves"][0]}
        )
        game = await _until_ply(alice, game, 2)
        game = (await _undo(alice, game)).json()
        assert game["ply"] == 0
    r = await alice.http.post(
        f"/api/v1/games/{game['id']}/moves", json={"ply": 0, "move": game["legal_moves"][0]}
    )
    game = await _until_ply(alice, game, 2)
    assert game["undo"] == "none"
    r = await _undo(alice, game)
    assert (r.status_code, _code(r)) == (409, "undo_limit")


# ── Against a person ──────────────────────────────────────────────────────


async def test_asking_and_accepting(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        _, bob_ws = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)  # alice has the goats
        assert game["undo"] == "none"
        game = await _moves(alice, bob, game, 1)
        assert game["undo"] == "ask"  # alice's view
        assert (await _game(bob, game))["undo"] == "none"  # bob has not moved

        r = await _undo(alice, game)
        assert r.status_code == 200, r.text
        assert (r.json()["takeback_offer"], r.json()["undo"]) == ("goat", "none")
        while (seen := (await _event(bob_ws, "game"))["game"])["takeback_offer"] is None:
            pass  # earlier updates
        assert seen["undo"] == "none"
        assert _code(await _undo(alice, game)) == "takeback_pending"
        assert _code(await _undo(alice, game, "accept")) == "no_takeback_offer"  # not her own

        before = await _game(bob, game)
        r = await _undo(bob, game, "accept")
        assert r.status_code == 200, r.text
        game = r.json()
        assert (game["ply"], game["moves"], game["side_to_move"]) == (0, [], "goat")
        assert game["takeback_offer"] is None
        assert game["clocks"]["goat_ms"] == before["clocks"]["goat_ms"]
        assert game["clocks"]["tiger_ms"] == before["clocks"]["tiger_ms"]


async def test_a_reply_goes_too_and_clocks_keep_their_time(
    app: FastAPI, players: PlayerFactory, clock: Any
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _moves(alice, bob, await _start(alice, bob), 4)  # alice to move
        clock.advance(seconds=7)
        game = (await _undo(alice, game)).json()
        assert game["takeback_offer"] == "goat"
        game = (await _undo(bob, game, "accept")).json()
        assert (game["ply"], game["side_to_move"], len(game["moves"])) == (2, "goat", 2)
        # The 7 seconds alice spent stay spent; the turn is hers again.
        assert game["clocks"]["goat_ms"] == 5 * 60_000 + 3_000 - 7_000
        assert game["clocks"]["running"] == "goat"


async def test_declining_and_playing_on(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _moves(alice, bob, await _start(alice, bob), 2)
        await _undo(alice, game)
        r = await _undo(bob, game, "decline")
        assert (r.status_code, r.json()["takeback_offer"], r.json()["ply"]) == (200, None, 2)
        assert _code(await _undo(bob, game, "decline")) == "no_takeback_offer"
        # Asking, then moving: the request lapses.
        await _undo(alice, game)
        game = await _moves(alice, bob, game, 1)
        assert game["takeback_offer"] is None
        assert _code(await _undo(bob, game, "accept")) == "no_takeback_offer"
        # Each request counts, answered or not.
        game = await _moves(alice, bob, game, 1)
        r = await _undo(alice, game)
        assert r.status_code == 200, r.text
        await _undo(bob, game, "decline")
        assert (await _game(alice, game))["undo"] == "none"
        r = await _undo(alice, game)
        assert (r.status_code, _code(r)) == (409, "undo_limit")


async def test_not_in_rated_games(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "3+2", "rated": True}
        )
        r = await bob.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
        game = (await bob.http.get(f"/api/v1/games/{r.json()['game_id']}")).json()
        goat = alice if game["goat"]["id"] == alice.id else bob
        tiger = bob if goat is alice else alice
        game = await _moves(goat, tiger, game, 2)
        assert (await _game(goat, game))["undo"] == "none"
        r = await _undo(goat, game)
        assert (r.status_code, _code(r)) == (409, "no_undo")
        assert r.json()["error"]["message"] == "Moves cannot be taken back in rated games."


async def test_not_in_tournament_games(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    people = {"alice": alice, "bob": bob, "carol": carol}
    t = await _host(app, alice)
    for p in (bob, carol):
        await p.http.post(f"{URL}/{t['code']}/join")
    await alice.http.post(f"{URL}/{t['code']}/start")
    started = await _get(alice, t["code"])
    (pairing,) = [p for p in started["pairings"] if p["round"] == 1 and p["tiger"] is not None]
    goat, tiger = people[pairing["goat"]["username"]], people[pairing["tiger"]["username"]]
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        game = await _start_pairing(people, t["code"], pairing)
        game = await _moves(goat, tiger, game, 2)
        assert (await _game(goat, game))["undo"] == "none"
        r = await _undo(goat, game)
        assert (r.status_code, _code(r)) == (409, "no_undo")
        assert r.json()["error"]["message"] == "Moves cannot be taken back in tournament games."
