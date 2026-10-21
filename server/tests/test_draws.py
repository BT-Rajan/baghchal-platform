"""Draws by agreement: offering, declining, accepting, and what a draw is worth."""

from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from baghchal_server.games import service

from .conftest import Player, PlayerFactory
from .test_games import _event, _online, _start
from .test_tournaments import URL, _get, _host, _start_pairing


async def _moves(goat: Player, tiger: Player, game: dict[str, Any], count: int) -> dict[str, Any]:
    """Play ``count`` legal moves, whoever's turn it is."""
    for _ in range(count):
        mover = goat if game["side_to_move"] == "goat" else tiger
        r = await mover.http.post(
            f"/api/v1/games/{game['id']}/moves",
            json={"ply": game["ply"], "move": game["legal_moves"][0]},
        )
        assert r.status_code == 200, r.text
        game = r.json()
    return game


def _draw(player: Player, game: dict[str, Any], *, decline: bool = False) -> Any:
    return player.http.post(f"/api/v1/games/{game['id']}/draw" + ("/decline" if decline else ""))


def _code(r: httpx.Response) -> str:
    return r.json()["error"]["code"]  # type: ignore[no-any-return]


async def test_an_offer_is_made_answered_and_lapses(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        _, bob_ws = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)  # alice has the goats
        assert _code(await _draw(alice, game)) == "no_draw"  # before both moved: abort instead
        game = await _moves(alice, bob, game, 2)

        r = await _draw(alice, game)
        assert r.json()["draw_offer"] == "goat"
        while (await _event(bob_ws, "game"))["game"]["draw_offer"] is None:
            pass  # earlier moves' updates

        assert (await _draw(alice, game)).json()["draw_offer"] == "goat"  # asking twice: no change
        r = await _draw(bob, game, decline=True)
        assert (r.status_code, r.json()["draw_offer"]) == (200, None)
        assert _code(await _draw(bob, game, decline=True)) == "no_draw_offer"
        assert _code(await _draw(alice, game)) == "draw_offer_wait"  # not again so soon

        game = await _moves(alice, bob, game, 4)
        assert (await _draw(alice, game)).json()["draw_offer"] == "goat"
        game = await _moves(alice, bob, game, 1)  # alice moves: her offer stands
        assert game["draw_offer"] == "goat"
        game = await _moves(alice, bob, game, 1)  # bob plays on: the offer lapses
        assert game["draw_offer"] is None
        assert game["status"] == "active"


async def test_accepting_ends_the_game_drawn(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _moves(alice, bob, await _start(alice, bob), 3)
        assert (await _draw(bob, game)).json()["draw_offer"] == "tiger"
        r = await _draw(alice, game)  # offering back accepts
        assert r.status_code == 200, r.text
        game = r.json()
    assert game["status"] == "finished"
    assert game["result"] == {"winner": None, "reason": "draw_agreed"}
    assert game["draw_offer"] is None
    assert _code(await _draw(bob, game)) == "game_over"
    for p in (alice, bob):
        (summary,) = (await p.http.get(f"/api/v1/players/{p.username}/games")).json()
        assert summary["outcome"] == "drawn"


async def test_a_rated_draw_is_half_a_point(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        r = await alice.http.post(
            "/api/v1/challenges",
            json={"opponent": "bob", "time_control": "3+2", "rated": True},
        )
        r = await bob.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
        game = (await bob.http.get(f"/api/v1/games/{r.json()['game_id']}")).json()
        goat = alice if game["goat"]["id"] == alice.id else bob
        tiger = bob if goat is alice else alice
        game = await _moves(goat, tiger, game, 2)
        await _draw(goat, game)
        game = (await _draw(tiger, game)).json()
    # Equal players drawing: neither rating moves, and the match is level.
    assert (game["ratings"]["goat"]["change"], game["ratings"]["tiger"]["change"]) == (0, 0)
    assert [s["points"] for s in game["match"]["score"]] == [0.5, 0.5]
    assert len(game["match"]["games"]) == 2  # the second game has begun


async def test_the_computer_plays_on(app_client: httpx.AsyncClient, players: PlayerFactory) -> None:
    alice = await players("alice")
    game = (await alice.http.post("/api/v1/games/computer", json={"level": "easy"})).json()
    assert _code(await _draw(alice, game)) == "no_draw"


async def test_a_tournament_draw_is_half_a_point_each(app: FastAPI, players: PlayerFactory) -> None:
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
        await _draw(goat, game)
        await _draw(tiger, game)
    after = await _get(alice, t["code"])
    points = {s["player"]["username"]: s["points"] for s in after["standings"]}
    byes = [b["player"]["username"] for b in after["byes"]]  # a bye is a point
    for player in (goat, tiger):
        assert points[player.username] == 0.5 + byes.count(player.username)
    (done,) = [p for p in after["pairings"] if p["id"] == pairing["id"]]
    assert (done["state"], done["winner"]) == ("done", None)


async def test_a_move_landing_first_wins(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Offering or accepting while a move lands: the move wins, and the player tries again."""
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _moves(alice, bob, await _start(alice, bob), 3)
        real_get = service.get_game

        async def as_seen_a_move_ago(db: Any, game_id: Any) -> Any:
            seen = await real_get(db, game_id)
            seen.ply -= 1  # what the player saw: the move after it is already in
            return seen

        monkeypatch.setattr(service, "get_game", as_seen_a_move_ago)
        assert _code(await _draw(alice, game)) == "stale_position"
        monkeypatch.setattr(service, "get_game", real_get)
        await _draw(alice, game)

        async def lost_race(*args: Any, **kwargs: Any) -> bool:
            return False

        monkeypatch.setattr(service, "_finish", lost_race)
        assert _code(await _draw(bob, game)) == "stale_position"


async def test_an_offer_made_while_the_other_side_moves_lapses(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        game = await _moves(alice, bob, game, 3)  # bob (tigers) to move
        real = service._engine_game

        async def offer_meanwhile(*args: Any, **kwargs: Any) -> Any:
            found = await real(*args, **kwargs)
            monkeypatch.setattr(service, "_engine_game", real)
            assert (await _draw(alice, game)).json()["draw_offer"] == "goat"
            return found

        monkeypatch.setattr(service, "_engine_game", offer_meanwhile)
        game = await _moves(alice, bob, game, 1)  # bob plays on
        assert game["draw_offer"] is None
