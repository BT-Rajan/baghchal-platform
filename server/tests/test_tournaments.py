"""Small tournaments: a Pro host's round robin among friends."""

import uuid
from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import update

from baghchal_server.deps import AppState
from baghchal_server.tournaments.models import Pairing

from .conftest import Player, PlayerFactory
from .test_billing import give_plan
from .test_games import _online, _start

URL = "/api/v1/tournaments"


async def _host(app: FastAPI, host: Player, **body: Any) -> dict[str, Any]:
    await give_plan(app, host, "pro")
    r = await host.http.post(URL, json={"name": "Friday cup", "time_control": "5+3", **body})
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


async def _get(player: Player, code: str) -> dict[str, Any]:
    return (await player.http.get(f"{URL}/{code}")).json()  # type: ignore[no-any-return]


def _pairing(t: dict[str, Any], goat: str, tiger: str) -> dict[str, Any]:
    (found,) = (
        p for p in t["pairings"] if (p["goat"]["username"], p["tiger"]["username"]) == (goat, tiger)
    )
    return found  # type: ignore[no-any-return]


async def _play(player: Player, code: str, pairing: dict[str, Any]) -> Any:
    return await player.http.post(f"{URL}/{code}/pairings/{pairing['id']}/play")


async def test_tournaments_are_for_pro(players: PlayerFactory) -> None:
    alice = await players("alice")
    r = await alice.http.post(URL, json={"name": "Cup", "time_control": "5+3"})
    assert (r.status_code, r.json()["error"]["message"]) == (
        403,
        "A tournament comes with ClawPlay Pro.",
    )


async def test_joining(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol, dave = [await players(n) for n in ("alice", "bob", "carol", "dave")]
    t = await _host(app, alice, max_players=3)
    code = t["code"]
    assert (t["name"], t["status"], [p["username"] for p in t["players"]]) == (
        "Friday cup",
        "open",
        ["alice"],
    )
    assert (t["standings"], t["pairings"]) == ([], [])
    r = await bob.http.post(f"{URL}/{code}/start")
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_host")
    r = await alice.http.post(f"{URL}/{code}/start")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "not_enough_players")

    await bob.http.post(f"{URL}/{code}/join")
    await bob.http.post(f"{URL}/{code}/join")  # once is enough
    await bob.http.post(f"{URL}/{code}/leave")
    await bob.http.post(f"{URL}/{code}/leave")
    await bob.http.post(f"{URL}/{code}/join")
    await carol.http.post(f"{URL}/{code}/join")
    r = await dave.http.post(f"{URL}/{code}/join")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "tournament_full")
    assert sorted(p["username"] for p in (await _get(dave, code))["players"]) == [
        "alice",
        "bob",
        "carol",
    ]
    r = await alice.http.post(f"{URL}/{code}/leave")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "host_cannot_leave")
    assert [t["code"] for t in (await carol.http.get(URL)).json()] == [code]

    started = (await alice.http.post(f"{URL}/{code}/start")).json()
    assert started["status"] == "running"
    assert len(started["pairings"]) == 6  # each pair twice, once with each side
    assert {(s["player"]["username"], s["points"]) for s in started["standings"]} == {
        ("alice", 0),
        ("bob", 0),
        ("carol", 0),
    }
    for who, path in ((dave, "join"), (bob, "leave")):
        r = await who.http.post(f"{URL}/{code}/{path}")
        assert (r.status_code, r.json()["error"]["code"]) == (409, "tournament_started")
    r = await alice.http.post(f"{URL}/{code}/start")
    assert r.status_code == 409
    assert (await bob.http.get(f"{URL}/nosuch")).status_code == 404


async def test_hosting_limits_and_blocks(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    t = await _host(app, alice)
    await _host(app, alice)
    await _host(app, alice)
    r = await alice.http.post(URL, json={"name": "Fourth", "time_control": "3+2"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_tournaments")
    await alice.http.put("/api/v1/blocks/bob")
    r = await bob.http.post(f"{URL}/{t['code']}/join")
    assert (r.status_code, r.json()["error"]["code"]) == (403, "player_blocked")


async def test_a_round_robin(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol, dave = [await players(n) for n in ("alice", "bob", "carol", "dave")]
    t = await _host(app, alice, time_control="3+2")
    code = t["code"]
    for p in (bob, carol):
        await p.http.post(f"{URL}/{code}/join")
    t = (await alice.http.post(f"{URL}/{code}/start")).json()
    first = _pairing(t, "alice", "bob")

    r = await _play(carol, code, first)
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_your_game")
    r = await _play(bob, code, first)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "player_offline")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol, dave)
        game = (await _play(bob, code, first)).json()
        assert (game["goat"]["username"], game["tiger"]["username"], game["rated"]) == (
            "alice",
            "bob",
            False,
        )
        assert game["time_control"] == "3+2"
        assert _pairing(await _get(bob, code), "alice", "bob")["state"] == "playing"
        r = await _play(alice, code, first)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "pairing_played")

        # An aborted game is played again.
        await alice.http.post(f"/api/v1/games/{game['id']}/abort")
        assert _pairing(await _get(bob, code), "alice", "bob")["state"] == "waiting"
        game = (await _play(alice, code, first)).json()
        await alice.http.post(f"/api/v1/games/{game['id']}/resign")
        done = _pairing(await _get(bob, code), "alice", "bob")
        assert (done["state"], done["winner"]["username"]) == ("done", "bob")

        # A player busy elsewhere cannot start one.
        busy = await _start(carol, dave)
        r = await _play(alice, code, _pairing(t, "alice", "carol"))
        assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")
        await carol.http.post(f"/api/v1/games/{busy['id']}/resign")

        # Everyone else's games: the goats resign each time.
        for goat, tiger in (
            ("alice", "carol"),
            ("bob", "alice"),
            ("bob", "carol"),
            ("carol", "alice"),
            ("carol", "bob"),
        ):
            people = {"alice": alice, "bob": bob, "carol": carol}
            game = (await _play(people[goat], code, _pairing(t, goat, tiger))).json()
            r = await people[goat].http.post(f"/api/v1/games/{game['id']}/resign")
            assert r.status_code == 200, r.text

    final = await _get(dave, code)
    assert final["status"] == "finished"  # every game played
    assert [(s["player"]["username"], s["points"], s["played"]) for s in final["standings"]] == [
        ("alice", 2, 4),
        ("bob", 2, 4),
        ("carol", 2, 4),
    ]
    r = await _play(alice, code, first)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "tournament_not_running")


async def test_the_host_ends_it(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = [await players(n) for n in ("alice", "bob", "carol")]
    t = await _host(app, alice)
    for p in (bob, carol):
        await p.http.post(f"{URL}/{t['code']}/join")
    await alice.http.post(f"{URL}/{t['code']}/start")
    r = await bob.http.post(f"{URL}/{t['code']}/finish")
    assert r.status_code == 403
    ended = (await alice.http.post(f"{URL}/{t['code']}/finish")).json()
    assert ended["status"] == "finished"
    assert (await alice.http.post(f"{URL}/{t['code']}/finish")).json()["status"] == "finished"
    other = await _host(app, carol)
    r = await _play(bob, t["code"], {"id": other["code"]})
    assert r.status_code == 422  # not a pairing id at all


async def test_pairings_belong_to_their_tournament_and_one_start_wins(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob, carol = [await players(n) for n in ("alice", "bob", "carol")]
    one = await _host(app, alice)
    two = await _host(app, alice)
    for t in (one, two):
        for p in (bob, carol):
            await p.http.post(f"{URL}/{t['code']}/join")
        await alice.http.post(f"{URL}/{t['code']}/start")
    one, two = await _get(alice, one["code"]), await _get(alice, two["code"])
    r = await _play(alice, one["code"], _pairing(two, "alice", "bob"))
    assert (r.status_code, r.json()["error"]["code"]) == (404, "pairing_not_found")

    state: AppState = app.state.ctx
    pairing = _pairing(one, "alice", "bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        other_game = (await _play(carol, two["code"], _pairing(two, "carol", "bob"))).json()
        await carol.http.post(f"/api/v1/games/{other_game['id']}/resign")

        async def someone_else_first(ids: Any) -> set[Any]:
            async with state.sessions() as db:
                await db.execute(
                    update(Pairing)
                    .where(Pairing.id == uuid.UUID(pairing["id"]))
                    .values(game_id=uuid.UUID(other_game["id"]))
                )
                await db.commit()
            return set(ids)

        monkeypatch.setattr(state.presence, "online", someone_else_first)
        r = await _play(alice, one["code"], pairing)
        assert (r.status_code, r.json()["error"]["message"]) == (
            409,
            "This game has just been started.",
        )
