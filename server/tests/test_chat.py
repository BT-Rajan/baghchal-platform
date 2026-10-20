"""Chat in games: adults with accounts only, filtered, kept 30 days, reportable."""

import uuid
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any

import httpx
from fastapi import FastAPI
from sqlalchemy import func, select, update

from baghchal_server import housekeeping
from baghchal_server.accounts.models import User
from baghchal_server.chat.models import ChatMessage
from baghchal_server.chat.service import clean
from baghchal_server.config import Settings
from baghchal_server.deps import AppState

from .conftest import AGREE, PASSWORD, Clock, Player, PlayerFactory
from .test_games import _event, _online, _start
from .test_moderation import moderator  # noqa: F401 - the fixture

CHAT = "/api/v1/games/{}/chat"


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


async def _say(player: Player, game: dict[str, Any], text: str) -> httpx.Response:
    return await player.http.post(CHAT.format(game["id"]), json={"text": text})


async def _read(player: Player, game: dict[str, Any]) -> dict[str, Any]:
    return (await player.http.get(CHAT.format(game["id"]))).json()  # type: ignore[no-any-return]


def _code(r: httpx.Response) -> str:
    return r.json()["error"]["code"]  # type: ignore[no-any-return]


async def _count(app: FastAPI) -> int:
    async with _state(app).sessions() as db:
        return (await db.scalar(select(func.count()).select_from(ChatMessage))) or 0


async def test_two_adults_chat_and_both_hear_it(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        alice_ws, bob_ws = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        assert await _read(bob, game) == {"open": True, "closed_because": None, "messages": []}
        r = await _say(alice, game, "  good\x07 luck\n  have fun ")
        assert r.status_code == 201, r.text
        assert r.json()["text"] == "good luck have fun"
        for ws in (alice_ws, bob_ws):
            event = await _event(ws, "chat")
            assert (event["side"], event["text"]) == ("goat", "good luck have fun")
        assert [m["text"] for m in (await _read(bob, game))["messages"]] == ["good luck have fun"]
        assert _code(await _say(bob, game, " \n ")) == "empty_message"
        outsider = await players("carol")
        assert (await outsider.http.get(CHAT.format(game["id"]))).status_code == 403
        assert (await _say(outsider, game, "hi")).status_code == 403


def test_blocked_words_are_masked() -> None:
    settings = Settings(blocked_username_words=("darn", ""))
    assert clean(settings, "Oh DARN it, darnation") == "Oh **** it, ****ation"


async def test_closed_for_minors_guests_and_the_computer(
    app: FastAPI, players: PlayerFactory, app_client: httpx.AsyncClient
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        async with _state(app).sessions() as db:  # bob turns out to be 17
            await db.execute(
                update(User)
                .where(User.id == uuid.UUID(bob.id))
                .values(adult_from=_state(app).clock() + timedelta(days=200))
            )
            await db.commit()
        assert (await _read(alice, game))["closed_because"] == "under_18"
        assert (await _read(alice, game))["messages"] == []
        assert _code(await _say(alice, game, "hi")) == "chat_closed"
        await alice.http.post(f"/api/v1/games/{game['id']}/abort")

    computer = (await alice.http.post("/api/v1/games/computer", json={"level": "easy"})).json()
    assert (await _read(alice, computer))["closed_because"] == "computer"
    await alice.http.post(f"/api/v1/games/{computer['id']}/resign")

    link = (await alice.http.post("/api/v1/challenges", json={"time_control": "5+3"})).json()
    r = await app_client.post("/api/v1/auth/guest", json={**AGREE, "transport": "bearer"})
    app_client.headers["authorization"] = f"Bearer {r.json()['token']}"
    guest = Player(r.json()["user"]["id"], r.json()["user"]["username"], app_client)
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, guest)
        r = await guest.http.post(f"/api/v1/challenges/link/{link['code']}/accept")
        game = (await guest.http.get(f"/api/v1/games/{r.json()['game_id']}")).json()
        assert (await _read(alice, game))["closed_because"] == "guest"


async def test_closed_by_choice_a_block_or_time(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        await _say(alice, game, "hello")
        await bob.http.patch("/api/v1/me/appearance", json={"emotes_on": False})
        assert await _read(alice, game) == {
            "open": False,
            "closed_because": "messages_off",
            "messages": [],
        }
        await bob.http.patch("/api/v1/me/appearance", json={"emotes_on": True})
        await bob.http.put("/api/v1/blocks/alice")
        assert (await _read(bob, game))["closed_because"] == "blocked"
        await bob.http.delete("/api/v1/blocks/alice")
        await bob.http.post(f"/api/v1/games/{game['id']}/abort")
        assert (await _read(bob, game))["open"] is True  # just over: "good game" is fine
        clock.advance(minutes=6)
        shown = await _read(bob, game)
        assert (shown["closed_because"], len(shown["messages"])) == ("game_over", 1)


async def test_moderators_export_deletion_and_thirty_days(
    app: FastAPI,
    players: PlayerFactory,
    clock: Clock,
    moderator: Player,  # noqa: F811
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        await _say(alice, game, "you are going down")
        clock.advance(seconds=2)
        await _say(bob, game, "we will see")
    mod = (await moderator.http.get(f"/api/v1/mod/games/{game['id']}/chat")).json()
    assert [(m["username"], m["text"]) for m in mod["messages"]] == [
        ("alice", "you are going down"),
        ("bob", "we will see"),
    ]
    assert (await alice.http.get(f"/api/v1/mod/games/{game['id']}/chat")).status_code == 403

    exported = (await alice.http.get("/api/v1/me/export")).json()
    assert [m["text"] for m in exported["chat_messages"]] == ["you are going down"]
    await alice.http.post(f"/api/v1/games/{game['id']}/abort")
    r = await alice.http.post("/api/v1/me/delete", json={"password": PASSWORD})
    assert r.status_code == 204, r.text
    assert await _count(app) == 1  # alice's went with her account; bob's stays

    clock.advance(days=31)
    async with _state(app).sessions() as db:
        done = await housekeeping.tidy(db, _state(app).settings, _state(app).clock())
    assert (done["chat_messages"], await _count(app)) == (1, 0)
