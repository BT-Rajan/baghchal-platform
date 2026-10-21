"""Tournaments: a Pro host's Swiss tournament among friends."""

import uuid
from collections.abc import Mapping
from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import select, update

from baghchal_server.deps import AppState
from baghchal_server.games import service as games
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


def _mine(t: dict[str, Any], username: str) -> dict[str, Any] | None:
    """This player's game in the round being played (None if they have the bye)."""
    for p in t["pairings"]:
        if p["round"] == t["round"] and username in (p["goat"]["username"], p["tiger"]["username"]):
            return p  # type: ignore[no-any-return]
    return None


async def _play_round(people: dict[str, Player], code: str) -> dict[str, Any]:
    """Play every game of the round being played: the goats resign each time."""
    t = await _get(next(iter(people.values())), code)
    for p in [p for p in t["pairings"] if p["round"] == t["round"]]:
        goat = people[p["goat"]["username"]]
        game = await _start_pairing(people, code, p)
        r = await goat.http.post(f"/api/v1/games/{game['id']}/resign")
        assert r.status_code == 200, r.text
    return await _get(next(iter(people.values())), code)


async def _play(player: Player, code: str, pairing: dict[str, Any]) -> Any:
    """Press "Play now": a challenge to the opponent."""
    return await player.http.post(f"{URL}/{code}/pairings/{pairing['id']}/play")


async def _start_pairing(
    people: Mapping[str, Player],
    code: str,
    pairing: dict[str, Any],
    by: Player | None = None,
) -> dict[str, Any]:
    """``by`` (the goat, unless given) presses "Play now" and the opponent accepts: the game,
    as ``by`` sees it."""
    goat, tiger = people[pairing["goat"]["username"]], people[pairing["tiger"]["username"]]
    by = goat if by is None else by
    opponent = tiger if by is goat else goat
    r = await _play(by, code, pairing)
    assert r.status_code == 201, r.text
    r = await opponent.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
    assert r.status_code == 200, r.text
    game = await by.http.get(f"/api/v1/games/{r.json()['game_id']}")
    return game.json()  # type: ignore[no-any-return]


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
    # Three players: two rounds; one game a round, and a bye (a point) for the odd one out.
    assert (started["round"], started["rounds"]) == (1, 2)
    assert (len(started["pairings"]), len(started["byes"])) == (1, 1)
    assert sorted(s["points"] for s in started["standings"]) == [0, 0, 1]
    # A bye is not a game to play.
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        bye = await db.scalar(select(Pairing).where(Pairing.tiger_id.is_(None)))
    assert bye is not None
    sitter = {"alice": alice, "bob": bob, "carol": carol}[started["byes"][0]["player"]["username"]]
    r = await _play(sitter, code, {"id": str(bye.id)})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "pairing_played")
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


async def test_a_swiss_tournament(app: FastAPI, players: PlayerFactory) -> None:
    names = ("alice", "bob", "carol", "dave")
    alice, bob, carol, dave = [await players(n) for n in names]
    eve = await players("eve")
    people = dict(zip(names, (alice, bob, carol, dave), strict=True))
    t = await _host(app, alice, time_control="3+2")
    code = t["code"]
    for p in (bob, carol, dave):
        await p.http.post(f"{URL}/{code}/join")
    t = (await alice.http.post(f"{URL}/{code}/start")).json()
    assert (t["round"], t["rounds"], len(t["pairings"]), t["byes"]) == (1, 3, 2, [])
    first = _mine(t, "alice")
    assert first is not None
    opponent = next(
        n for n in (first["goat"]["username"], first["tiger"]["username"]) if n != "alice"
    )
    outsider = next(n for n in names if n not in {"alice", opponent})

    r = await _play(people[outsider], code, first)
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_your_game")
    r = await _play(alice, code, first)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "player_offline")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol, dave, eve)
        game = await _start_pairing(people, code, first, by=alice)
        assert (game["rated"], game["time_control"]) == (False, "3+2")
        assert _mine(await _get(bob, code), "alice")["state"] == "playing"  # type: ignore[index]
        r = await _play(alice, code, first)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "pairing_played")

        # An aborted game is played again.
        await alice.http.post(f"/api/v1/games/{game['id']}/abort")
        assert _mine(await _get(bob, code), "alice")["state"] == "waiting"  # type: ignore[index]

        # A player busy elsewhere cannot start one.
        busy = await _start(people[outsider], eve)
        theirs = _mine(t, outsider)
        assert theirs is not None
        r = await _play(people[outsider], code, theirs)
        assert (r.status_code, r.json()["error"]["code"]) == (409, "player_busy")
        await people[outsider].http.post(f"/api/v1/games/{busy['id']}/resign")

        # Three rounds; the tigers win every game (the goats resign).
        after_one = await _play_round(people, code)
        assert after_one["round"] == 2
        # Round 2: the two winners meet, and the two losers.
        points = {s["player"]["username"]: s["points"] for s in after_one["standings"]}
        for p in (p for p in after_one["pairings"] if p["round"] == 2):
            assert points[p["goat"]["username"]] == points[p["tiger"]["username"]]
        await _play_round(people, code)
        final = await _play_round(people, code)

    assert final["status"] == "finished"  # every round played
    assert final["round"] == 3
    met = {frozenset((p["goat"]["username"], p["tiger"]["username"])) for p in final["pairings"]}
    assert len(met) == 6  # nobody met anyone twice: four players, three rounds, everyone met
    standings = final["standings"]
    assert sum(s["points"] for s in standings) == 6
    assert [s["points"] for s in standings] == sorted(
        (s["points"] for s in standings), reverse=True
    )
    for s in standings:  # the tie-break: everyone's opponents' points
        assert s["buchholz"] == 6 - s["points"]
    r = await _play(alice, code, first)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "tournament_not_running")


async def test_a_bye_goes_round(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = [await players(n) for n in ("alice", "bob", "carol")]
    people = {"alice": alice, "bob": bob, "carol": carol}
    t = await _host(app, alice)
    for p in (bob, carol):
        await p.http.post(f"{URL}/{t['code']}/join")
    first = (await alice.http.post(f"{URL}/{t['code']}/start")).json()
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        second = await _play_round(people, t["code"])
        assert second["round"] == 2
        sat = {b["player"]["username"] for b in second["byes"]}
        assert len(sat) == 2  # the bye went to someone who had not had one
        assert first["byes"][0]["player"]["username"] in sat
        final = await _play_round(people, t["code"])
    assert final["status"] == "finished"


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
    r = await _play(alice, one["code"], two["pairings"][0])
    assert (r.status_code, r.json()["error"]["code"]) == (404, "pairing_not_found")

    state: AppState = app.state.ctx
    pairing = one["pairings"][0]
    people = {"alice": alice, "bob": bob, "carol": carol}
    starter = people[pairing["goat"]["username"]]
    elsewhere = two["pairings"][0]
    other_player = people[elsewhere["goat"]["username"]]
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        other_game = await _start_pairing(people, two["code"], elsewhere)
        await other_player.http.post(f"/api/v1/games/{other_game['id']}/resign")

        asked = (await _play(starter, one["code"], pairing)).json()
        opponent = people[pairing["tiger"]["username"]]
        real_cooldown = games.abort_cooldown

        async def someone_else_first(*args: Any) -> Any:
            """Between the accept's checks and its start, the pairing gets a game."""
            async with state.sessions() as db:
                await db.execute(
                    update(Pairing)
                    .where(Pairing.id == uuid.UUID(pairing["id"]))
                    .values(game_id=uuid.UUID(other_game["id"]))
                )
                await db.commit()
            return await real_cooldown(*args)

        monkeypatch.setattr(games, "abort_cooldown", someone_else_first)
        r = await opponent.http.post(f"/api/v1/challenges/{asked['id']}/accept")
        assert (r.status_code, r.json()["error"]["message"]) == (
            409,
            "This game has just been started.",
        )
    monkeypatch.undo()
    # Nothing was started: the challenge is still open.
    (still,) = (await opponent.http.get("/api/v1/challenges")).json()["incoming"]
    assert (still["id"], still["status"]) == (asked["id"], "pending")
