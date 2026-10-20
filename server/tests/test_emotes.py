"""Quick messages in a game: set phrases, to the opponent, unless they turned them off."""

import asyncio
from contextlib import AsyncExitStack

import httpx
from fastapi import FastAPI

from .conftest import Clock, Player, PlayerFactory
from .test_games import _event, _move, _online, _start

APPEARANCE = "/api/v1/me/appearance"


async def _emote(player: Player, game_id: str, emote: str = "good_luck") -> httpx.Response:
    return await player.http.post(f"/api/v1/games/{game_id}/emote", json={"emote": emote})


async def test_an_emote_reaches_the_opponent(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        _, bob_ws = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        assert (await _emote(alice, game["id"])).status_code == 204
        event = await _event(bob_ws, "emote")
        assert event == {
            "type": "emote",
            "game_id": game["id"],
            "side": "goat",
            "emote": "good_luck",
        }

        # bob turns them off: alice's next one does not reach him, though her move does.
        assert (await bob.http.get(APPEARANCE)).json()["emotes_on"] is True
        r = await bob.http.patch(APPEARANCE, json={"emotes_on": False})
        assert r.json()["emotes_on"] is False
        assert (await _emote(alice, game["id"], "oops")).status_code == 204
        await _move(alice, game, "a2")
        # The emote would have come first; the next message bob gets is the move.
        while (message := await asyncio.wait_for(bob_ws.receive_json(), timeout=2))[
            "type"
        ] == "probe":
            pass
        assert message["type"] == "game"


async def test_who_and_when(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice, bob, carol = [await players(n) for n in ("alice", "bob", "carol")]
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
    r = await _emote(carol, game["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_your_game")
    r = await _emote(alice, game["id"], "you lose")
    assert r.status_code == 422  # set phrases only

    await bob.http.post(f"/api/v1/games/{game['id']}/resign")
    assert (await _emote(alice, game["id"], "well_played")).status_code == 204
    clock.advance(minutes=6)
    r = await _emote(alice, game["id"], "well_played")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_over")

    computer = await alice.http.post("/api/v1/games/computer", json={"level": "easy"})
    r = await _emote(alice, computer.json()["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "nobody_to_hear")


async def test_no_emotes_between_blocked_players(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        _, bob_ws = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        assert (await bob.http.put("/api/v1/blocks/alice")).status_code == 204
        assert (await _emote(alice, game["id"], "oops")).status_code == 204  # nothing said
        await _move(alice, game, "a2")
        seen = []  # everything bob hears up to the move
        while (message := await asyncio.wait_for(bob_ws.receive_json(), timeout=2))[
            "type"
        ] != "game":
            seen.append(message["type"])
        assert "emote" not in seen
