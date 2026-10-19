"""Notifications: a record of what happened while a player was away."""

import uuid
from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import func, select

from baghchal_server.deps import AppState
from baghchal_server.notifications import service
from baghchal_server.notifications.models import Notification

from .conftest import PASSWORD, Clock, Player, PlayerFactory
from .test_games import _event, _online
from .test_tournaments import URL as TOURNAMENTS
from .test_tournaments import _host

URL = "/api/v1/notifications"


async def _mine(player: Player) -> dict[str, Any]:
    r = await player.http.get(URL)
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


def _kinds(data: dict[str, Any]) -> list[str]:
    return [n["kind"] for n in data["items"]]


async def test_a_challenge_is_noted_and_read(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        _, bob_ws = await _online(app, stack, alice, bob)
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "5+3", "rated": True}
        )
        assert r.status_code == 201, r.text
        await _event(bob_ws, "notification")
    data = await _mine(bob)
    assert data["unread"] == 1
    (note,) = data["items"]
    assert (note["kind"], note["actor"]["username"], note["detail"], note["read"]) == (
        "challenge",
        "alice",
        "5+3 rated",
        False,
    )
    assert (await _mine(alice))["items"] == []  # nothing for the challenger

    assert (await bob.http.post(f"{URL}/read")).status_code == 204
    data = await _mine(bob)
    assert (data["unread"], data["items"][0]["read"]) == (0, True)


async def test_friends(players: PlayerFactory, clock: Clock) -> None:
    alice, bob = await players("alice"), await players("bob")
    await alice.http.post("/api/v1/friends/bob")
    await alice.http.post("/api/v1/friends/bob")  # asking again is not news
    await alice.http.delete("/api/v1/friends/bob")
    clock.advance(seconds=1)
    await alice.http.post("/api/v1/friends/bob")  # asking anew replaces the earlier one
    assert _kinds(await _mine(bob)) == ["friend_request"]
    clock.advance(seconds=1)
    await bob.http.post("/api/v1/friends/alice")
    assert _kinds(await _mine(alice)) == ["friend_accepted"]


async def test_a_tournament_starting(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = [await players(n) for n in ("alice", "bob", "carol")]
    code = (await _host(app, alice))["code"]
    for p in (bob, carol):
        await p.http.post(f"{TOURNAMENTS}/{code}/join")
    assert (await alice.http.post(f"{TOURNAMENTS}/{code}/start")).status_code == 200
    (note,) = (await _mine(bob))["items"]
    assert (note["kind"], note["tournament"], note["actor"]["username"]) == (
        "tournament_started",
        {"code": code, "name": "Friday cup"},
        "alice",
    )
    assert _kinds(await _mine(carol)) == ["tournament_started"]
    assert (await _mine(alice))["items"] == []  # the host started it


async def test_only_the_newest_are_kept(
    players: PlayerFactory, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(service, "KEEP", 2)
    alice = await players("alice")
    for name in ("bob", "carol", "dave"):
        await (await players(name)).http.post("/api/v1/friends/alice")
        clock.advance(seconds=1)
    names = [n["actor"]["username"] for n in (await _mine(alice))["items"]]
    assert names == ["dave", "carol"]


async def test_gone_actors_and_tournaments(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        for kind, ref in (("challenge", "5+3 casual"), ("tournament_started", "gone")):
            db.add(
                Notification(user_id=uuid.UUID(alice.id), kind=kind, ref=ref, created_at=clock.now)
            )
        await db.commit()
    (note,) = (await _mine(alice))["items"]  # the vanished tournament is left out
    assert (note["kind"], note["actor"]) == ("challenge", None)


async def test_blocking_export_and_deletion(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = [await players(n) for n in ("alice", "bob", "carol")]
    await bob.http.post("/api/v1/friends/alice")
    await carol.http.post("/api/v1/friends/alice")
    assert (await alice.http.put("/api/v1/blocks/bob")).status_code == 204
    assert [n["actor"]["username"] for n in (await _mine(alice))["items"]] == ["carol"]

    export = (await alice.http.get("/api/v1/me/export")).json()
    assert [(n["kind"], n["read_at"]) for n in export["notifications"]] == [
        ("friend_request", None)
    ]
    assert (
        await alice.http.post("/api/v1/me/delete", json={"password": PASSWORD})
    ).status_code == 204
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        left = await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == uuid.UUID(alice.id))
        )
    assert left == 0
