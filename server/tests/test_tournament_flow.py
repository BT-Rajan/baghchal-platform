"""A tournament reaching its end: rounds move on when their last game ends, players are told,
and games nobody can play are won without playing (forfeits)."""

import asyncio
from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import select

from baghchal_server.deps import AppState
from baghchal_server.tournaments import service as tournaments
from baghchal_server.tournaments.models import Pairing, Tournament

from .conftest import PASSWORD, Player, PlayerFactory
from .test_games import _online
from .test_tournaments import URL, _get, _host, _mine, _play

NAMES = ("alice", "bob", "carol", "dave")


async def _started(app: FastAPI, players: PlayerFactory) -> tuple[dict[str, Player], str]:
    """Four players in a running tournament hosted by alice (round 1 paired)."""
    people = {n: await players(n) for n in NAMES}
    code = (await _host(app, people["alice"]))["code"]
    for name in NAMES[1:]:
        assert (await people[name].http.post(f"{URL}/{code}/join")).status_code == 200
    assert (await people["alice"].http.post(f"{URL}/{code}/start")).status_code == 200
    return people, code


def _round(t: dict[str, Any], number: int) -> list[dict[str, Any]]:
    return [p for p in t["pairings"] if p["round"] == number]


async def _notes(player: Player) -> list[tuple[str, str | None]]:
    items = (await player.http.get("/api/v1/notifications")).json()["items"]
    return [(n["kind"], (n["actor"] or {}).get("username")) for n in items]


async def test_the_next_round_is_paired_when_the_last_game_ends(
    app: FastAPI, players: PlayerFactory
) -> None:
    people, code = await _started(app, players)
    t = await _get(people["alice"], code)
    async with AsyncExitStack() as stack:
        await _online(app, stack, *people.values())
        for pairing in _round(t, 1):
            goat = people[pairing["goat"]["username"]]
            game = (await _play(goat, code, pairing)).json()
            assert (await goat.http.post(f"/api/v1/games/{game['id']}/resign")).status_code == 200
    # Nobody looked at the tournament in between: the round moved on with the last game.
    async with app.state.ctx.sessions() as db:
        stored = await db.scalar(select(Tournament).where(Tournament.code == code))
        assert stored is not None
        assert stored.round == 2
    t = await _get(people["bob"], code)
    second = _round(t, 2)
    assert len(second) == 2
    # Each player is told who they meet.
    for p in second:
        for me, them in ((p["goat"], p["tiger"]), (p["tiger"], p["goat"])):
            notes = await _notes(people[me["username"]])
            assert ("tournament_round", them["username"]) in notes
            item = (await people[me["username"]].http.get("/api/v1/notifications")).json()
            assert item["items"][0]["tournament"] == {"code": code, "name": "Friday cup"}


async def test_the_host_gives_a_game_to_the_player_who_turned_up(
    app: FastAPI, players: PlayerFactory
) -> None:
    people, code = await _started(app, players)
    t = await _get(people["alice"], code)
    first, second = _round(t, 1)
    award = f"{URL}/{code}/pairings/{first['id']}/award"
    r = await people["bob"].http.post(award, json={"winner": "goat"})
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_host")
    r = await people["alice"].http.post(award, json={"winner": "goat"})
    assert r.status_code == 200, r.text
    given = next(p for p in r.json()["pairings"] if p["id"] == first["id"])
    assert (given["state"], given["forfeit"], given["winner"]) == (
        "done",
        True,
        first["goat"],
    )
    assert (await people["alice"].http.post(award, json={"winner": "tiger"})).status_code == 409
    goat = people[first["goat"]["username"]]
    assert (await _play(goat, code, first)).status_code == 409  # nothing left to play
    standing = {s["player"]["username"]: s for s in r.json()["standings"]}
    assert (
        standing[first["goat"]["username"]]["points"],
        standing[first["goat"]["username"]]["played"],
    ) == (1, 0)

    # A game being played cannot be given; once the round is over, the next is paired.
    async with AsyncExitStack() as stack:
        await _online(app, stack, *people.values())
        mover = people[second["goat"]["username"]]
        game = (await _play(mover, code, second)).json()
        r = await people["alice"].http.post(
            f"{URL}/{code}/pairings/{second['id']}/award", json={"winner": "tiger"}
        )
        assert r.status_code == 409
        await mover.http.post(f"/api/v1/games/{game['id']}/resign")
    t = await _get(people["alice"], code)
    assert t["round"] == 2
    # And the end: give every game of every round; everyone is told it ended.
    while t["status"] == "running":
        for p in _round(t, t["round"]):
            await people["alice"].http.post(
                f"{URL}/{code}/pairings/{p['id']}/award", json={"winner": "goat"}
            )
        t = await _get(people["alice"], code)
    for person in people.values():
        assert ("tournament_finished", None) in await _notes(person)


async def test_a_player_who_leaves_loses_their_games_and_is_paired_no_more(
    app: FastAPI, players: PlayerFactory
) -> None:
    people, code = await _started(app, players)
    t = await _get(people["alice"], code)
    dave = _mine(t, "dave")
    assert dave is not None
    r = await people["dave"].http.post("/api/v1/me/delete", json={"password": PASSWORD})
    assert r.status_code == 204
    t = await _get(people["alice"], code)
    gone = next(p for p in t["pairings"] if p["id"] == dave["id"])
    opponent = gone["tiger"] if gone["goat"]["id"] == people["dave"].id else gone["goat"]
    assert (gone["forfeit"], gone["winner"]) == (True, opponent)
    other = next(p for p in _round(t, 1) if p["id"] != dave["id"])
    async with AsyncExitStack() as stack:
        await _online(app, stack, *[people[n] for n in NAMES[:3]])
        goat = people[other["goat"]["username"]]
        game = (await _play(goat, code, other)).json()
        await goat.http.post(f"/api/v1/games/{game['id']}/resign")
    t = await _get(people["alice"], code)
    # Three left: one game and a bye, without dave; he stays in the standings.
    assert t["round"] == 2
    paired = {p["goat"]["id"] for p in _round(t, 2)} | {p["tiger"]["id"] for p in _round(t, 2)}
    assert len(t["standings"]) == 4
    assert people["dave"].id not in paired | {
        b["player"]["id"] for b in t["byes"] if b["round"] == 2
    }
    assert len(t["byes"]) == 1


async def test_a_block_gives_the_game_to_the_one_blocked(
    app: FastAPI, players: PlayerFactory
) -> None:
    people, code = await _started(app, players)
    t = await _get(people["alice"], code)
    pairing = _round(t, 1)[0]
    blocker, blocked = pairing["goat"]["username"], pairing["tiger"]["username"]
    assert (await people[blocker].http.put(f"/api/v1/blocks/{blocked}")).status_code == 204
    t = await _get(people["alice"], code)
    given = next(p for p in t["pairings"] if p["id"] == pairing["id"])
    assert (given["forfeit"], given["winner"]["username"]) == (True, blocked)


async def test_starting_twice_at_once_draws_round_one_once(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    people = {n: await players(n) for n in NAMES}
    code = (await _host(app, people["alice"]))["code"]
    for name in NAMES[1:]:
        await people[name].http.post(f"{URL}/{code}/join")
    real = tournaments._ratings

    async def slow(*args: Any, **kwargs: Any) -> Any:
        found = await real(*args, **kwargs)
        await asyncio.sleep(0.2)  # both read before either writes
        return found

    monkeypatch.setattr(tournaments, "_ratings", slow)
    started = await asyncio.gather(
        *(people["alice"].http.post(f"{URL}/{code}/start") for _ in range(2))
    )
    assert sorted(r.status_code for r in started) == [200, 409]
    assert len(_round(await _get(people["alice"], code), 1)) == 2


async def test_joining_at_once_keeps_the_size(app: FastAPI, players: PlayerFactory) -> None:
    people = {n: await players(n) for n in NAMES}
    code = (await _host(app, people["alice"], max_players=3))["code"]
    await people["bob"].http.post(f"{URL}/{code}/join")
    joined = await asyncio.gather(
        *(people[n].http.post(f"{URL}/{code}/join") for n in ("carol", "dave"))
    )
    assert sorted(r.status_code for r in joined) == [200, 409]
    assert len((await _get(people["alice"], code))["players"]) == 3


async def test_a_round_moves_on_once_however_many_ask(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    people, code = await _started(app, players)
    state: AppState = app.state.ctx
    async with state.sessions() as db:  # round 1 played without anyone moving it on
        stored = await db.scalar(select(Tournament).where(Tournament.code == code))
        assert stored is not None
        for p in await db.scalars(select(Pairing).where(Pairing.tournament_id == stored.id)):
            p.forfeit_to = p.goat_id
        await db.commit()
    real = tournaments._ratings

    async def slow(*args: Any, **kwargs: Any) -> Any:
        found = await real(*args, **kwargs)
        await asyncio.sleep(0.2)
        return found

    monkeypatch.setattr(tournaments, "_ratings", slow)

    async def advance() -> Any:
        async with state.sessions() as db:
            t = await db.scalar(select(Tournament).where(Tournament.code == code))
            assert t is not None
            return await tournaments.advance(db, state.clock(), t)

    steps = await asyncio.gather(advance(), advance())
    assert sorted(step is None for step in steps) == [False, True]
    assert len(_round(await _get(people["bob"], code), 2)) == 2
