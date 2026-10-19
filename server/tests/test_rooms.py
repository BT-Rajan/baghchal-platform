"""Private rooms: a Pro host's link to one casual game."""

from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import update

from baghchal_server.deps import AppState
from baghchal_server.rooms.models import Room

from .conftest import Clock, Player, PlayerFactory
from .test_billing import give_plan
from .test_games import _online, _start


async def _room(host: Player, **body: Any) -> dict[str, Any]:
    r = await host.http.post("/api/v1/rooms", json={"time_control": "5+3", **body})
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


async def _join(guest: Player, code: str) -> Any:
    return await guest.http.post(f"/api/v1/rooms/{code}/join")


async def test_rooms_are_for_pro(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.post("/api/v1/rooms", json={"time_control": "5+3"})
    assert (r.status_code, r.json()["error"]["message"]) == (
        403,
        "A private room comes with ClawPlay Pro.",
    )
    await give_plan(app, alice, "plus")
    assert (await alice.http.post("/api/v1/rooms", json={"time_control": "5+3"})).status_code == 403


async def test_a_friend_joins_and_the_game_starts(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    await give_plan(app, alice, "pro")
    room = await _room(alice, side="tiger", time_control="10+5")
    assert (room["host"]["username"], room["host_side"], room["status"]) == (
        "alice",
        "tiger",
        "open",
    )
    assert [r["code"] for r in (await alice.http.get("/api/v1/rooms")).json()] == [room["code"]]
    seen = (await bob.http.get(f"/api/v1/rooms/{room['code']}")).json()
    assert (seen["host"]["username"], seen["time_control"]) == ("alice", "10+5")

    r = await _join(bob, room["code"])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "host_offline")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice)
        r = await _join(alice, room["code"])
        assert (r.status_code, r.json()["error"]["code"]) == (409, "own_room")
        r = await _join(bob, room["code"])
        assert r.status_code == 200, r.text
        joined = r.json()
        assert joined["status"] == "played"
        game = (await bob.http.get(f"/api/v1/games/{joined['game_id']}")).json()
        assert (game["goat"]["username"], game["tiger"]["username"]) == ("bob", "alice")
        assert (game["rated"], game["time_control"]) == (False, "10+5")

        r = await _join(carol, room["code"])
        assert (r.status_code, r.json()["error"]["code"]) == (409, "room_closed")
    assert (await alice.http.get("/api/v1/rooms")).json() == []


async def test_closing_expiry_and_limits(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await give_plan(app, alice, "pro")
    rooms = [await _room(alice) for _ in range(5)]
    r = await alice.http.post("/api/v1/rooms", json={"time_control": "3+2"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_rooms")

    code = rooms[0]["code"]
    r = await bob.http.post(f"/api/v1/rooms/{code}/close")
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_your_room")
    assert (await alice.http.post(f"/api/v1/rooms/{code}/close")).json()["status"] == "closed"
    assert (await alice.http.post(f"/api/v1/rooms/{code}/close")).json()["status"] == "closed"
    assert (await _join(bob, code)).json()["error"]["code"] == "room_closed"

    clock.advance(days=2)  # rooms last a day
    assert (await bob.http.get(f"/api/v1/rooms/{rooms[1]['code']}")).json()["status"] == "closed"
    assert (await alice.http.get("/api/v1/rooms")).json() == []
    assert (await bob.http.get("/api/v1/rooms/nosuchroom")).status_code == 404
    assert (await bob.http.get("/api/v1/rooms/bad!code")).status_code == 422


async def test_who_cannot_join(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol, dave = [await players(n) for n in ("alice", "bob", "carol", "dave")]
    await give_plan(app, alice, "pro")
    room = await _room(alice)
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, dave)
        await alice.http.put("/api/v1/blocks/carol")
        r = await _join(carol, room["code"])
        assert (r.status_code, r.json()["error"]["code"]) == (403, "player_blocked")

        await _start(dave, bob)  # bob is busy
        r = await _join(bob, room["code"])
        assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")
        # ...and the room is still open for someone else.
        assert (await alice.http.get(f"/api/v1/rooms/{room['code']}")).json()["status"] == "open"


async def test_two_guests_at_once(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await give_plan(app, alice, "pro")
    room = await _room(alice)
    state: AppState = app.state.ctx

    async def someone_else_first(ids: Any) -> set[Any]:
        async with state.sessions() as other:
            await other.execute(
                update(Room).where(Room.code == room["code"]).values(status="played")
            )
            await other.commit()
        return set(ids)

    monkeypatch.setattr(state.presence, "online", someone_else_first)
    r = await _join(bob, room["code"])
    assert (r.status_code, r.json()["error"]["message"]) == (409, "Someone else joined first.")
