"""Challenges by link: for whoever opens the link first, a friend not yet on ClawPlay too."""

from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import update

from baghchal_server.deps import AppState
from baghchal_server.lobby.models import Challenge

from .conftest import ORIGIN, Clock, Player, PlayerFactory
from .test_games import _online, _start

URL = "/api/v1/challenges"


async def _link(player: Player, **body: Any) -> dict[str, Any]:
    r = await player.http.post(URL, json={"time_control": "5+3", **body})
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


async def _accept(player: Player | httpx.AsyncClient, code: str) -> httpx.Response:
    http = player.http if isinstance(player, Player) else player
    return await http.post(f"{URL}/link/{code}/accept")


async def test_a_link_for_anyone(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    link = await _link(alice, side="tiger", time_control="10+5")
    assert (link["opponent"], link["rated"], link["side"], link["status"]) == (
        None,
        False,
        "tiger",
        "pending",
    )
    code = link["code"]
    # It is an outgoing challenge like any other, open for a day.
    assert [c["code"] for c in (await alice.http.get(URL)).json()["outgoing"]] == [code]
    assert (await bob.http.get(URL)).json()["incoming"] == []
    seen = (await bob.http.get(f"{URL}/link/{code}")).json()
    assert (seen["challenger"]["username"], seen["time_control"]) == ("alice", "10+5")

    r = await _accept(bob, code)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "player_offline")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice)
        r = await _accept(alice, code)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "own_challenge")
        r = await _accept(bob, code)
        assert r.status_code == 200, r.text
        accepted = r.json()
        assert (accepted["status"], accepted["opponent"]["username"]) == ("accepted", "bob")
        game = (await bob.http.get(f"/api/v1/games/{accepted['game_id']}")).json()
        assert (game["goat"]["username"], game["tiger"]["username"]) == ("bob", "alice")
        assert (game["rated"], game["time_control"]) == (False, "10+5")
        r = await _accept(carol, code)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "challenge_closed")


async def test_a_guest_accepts(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    code = (await _link(alice))["code"]
    async with (
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
            headers={"Origin": ORIGIN},
        ) as friend,
        AsyncExitStack() as stack,
    ):
        await friend.post("/api/v1/auth/guest", json={})
        await _online(app, stack, alice)
        r = await _accept(friend, code)
        assert r.status_code == 200, r.text
        assert r.json()["opponent"]["username"].startswith("guest-")


async def test_links_are_casual_and_expire(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    r = await alice.http.post(URL, json={"time_control": "5+3", "rated": True})
    assert r.status_code == 422
    code = (await _link(alice))["code"]
    clock.advance(days=2)
    assert (await bob.http.get(f"{URL}/link/{code}")).json()["status"] == "expired"
    assert (await _accept(bob, code)).json()["error"]["code"] == "challenge_closed"
    assert (await bob.http.get(f"{URL}/link/nosuch")).status_code == 404
    assert (await bob.http.get(f"{URL}/link/bad!code")).status_code == 422


async def test_cancelling_and_limits(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    links = [await _link(alice) for _ in range(5)]
    r = await alice.http.post(URL, json={"time_control": "3+2"})
    assert (r.status_code, r.json()["error"]["code"]) == (429, "too_many_challenges")
    r = await alice.http.post(f"{URL}/{links[0]['id']}/cancel")
    assert r.json()["status"] == "cancelled"
    assert (await _accept(bob, links[0]["code"])).json()["error"]["code"] == "challenge_closed"


async def test_who_cannot_accept(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol, dave = [await players(n) for n in ("alice", "bob", "carol", "dave")]
    code = (await _link(alice))["code"]
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, dave)
        await alice.http.put("/api/v1/blocks/carol")
        r = await _accept(carol, code)
        assert (r.status_code, r.json()["error"]["code"]) == (403, "challenge_refused")

        await _start(dave, bob)  # bob is busy
        r = await _accept(bob, code)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")
        # ...and the link is still open for someone else.
        assert (await alice.http.get(f"{URL}/link/{code}")).json()["status"] == "pending"


async def test_two_friends_at_once(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    code = (await _link(alice))["code"]
    state: AppState = app.state.ctx

    async def someone_else_first(ids: Any) -> set[Any]:
        async with state.sessions() as other:
            await other.execute(
                update(Challenge).where(Challenge.code == code).values(status="accepted")
            )
            await other.commit()
        return set(ids)

    monkeypatch.setattr(state.presence, "online", someone_else_first)
    r = await _accept(bob, code)
    assert (r.status_code, r.json()["error"]["message"]) == (409, "Someone else accepted first.")


async def test_an_unanswered_link_in_the_export(players: PlayerFactory) -> None:
    alice = await players("alice")
    await _link(alice)
    (exported,) = (await alice.http.get("/api/v1/me/export")).json()["challenges"]
    assert (exported["direction"], exported["opponent"]) == ("sent", None)
