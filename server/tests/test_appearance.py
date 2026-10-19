"""Board themes, piece sets and sound packs, and the badge others see."""

from typing import Any

from fastapi import FastAPI

from .conftest import Clock, Player, PlayerFactory
from .test_billing import give_plan, make_admin

URL = "/api/v1/me/appearance"
FREE = {
    "board": "wood",
    "pieces": "classic",
    "sounds": "gentle",
    "sounds_on": True,
    "show_badge": True,
}
THEMED = {**FREE, "board": "walnut", "pieces": "porcelain", "sounds": "bells"}


async def _badge(viewer: Player, username: str) -> Any:
    return (await viewer.http.get(f"/api/v1/players/{username}")).json()["badge"]


async def test_themes_come_with_plus(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    assert (await alice.http.get(URL)).json() == FREE
    r = await alice.http.patch(URL, json=THEMED)
    assert (r.status_code, r.json()["error"]["message"]) == (
        403,
        "A choice of boards, pieces and sounds comes with ClawPlay Plus.",
    )
    # Hiding the badge, and the free set, need nothing.
    r = await alice.http.patch(URL, json={**FREE, "show_badge": False})
    assert r.json() == {**FREE, "show_badge": False}
    r = await alice.http.patch(URL, json={**FREE, "board": "chess"})
    assert r.status_code == 422

    await give_plan(app, alice)
    r = await alice.http.patch(URL, json=THEMED)
    assert (r.status_code, r.json()) == (200, THEMED)
    assert (await alice.http.get(URL)).json() == THEMED


async def test_choices_wait_out_a_lapse(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    r = await boss.http.post(
        "/api/v1/admin/players/alice/grants", json={"plan": "plus", "days": 7, "reason": "Trial"}
    )
    assert r.status_code == 201
    await alice.http.patch(URL, json={**THEMED, "show_badge": False})

    clock.advance(days=8)  # the trial is over: the free set, but the badge choice stays
    assert (await alice.http.get(URL)).json() == {**FREE, "show_badge": False}

    # Muting the game meanwhile keeps the theme waiting.
    r = await alice.http.patch(URL, json={"sounds_on": False})
    assert r.json() == {**FREE, "sounds_on": False, "show_badge": False}

    await boss.http.post(
        "/api/v1/admin/players/alice/grants", json={"plan": "plus", "days": 7, "reason": "Back"}
    )
    assert (await alice.http.get(URL)).json() == {
        **THEMED,
        "sounds_on": False,
        "show_badge": False,
    }


async def test_badges(app: FastAPI, players: PlayerFactory) -> None:
    boss, alice, bob = await players("boss"), await players("alice"), await players("bob")
    await make_admin(app, boss)
    assert await _badge(bob, "alice") is None

    await give_plan(app, alice)
    await give_plan(app, bob, "pro")
    assert await _badge(bob, "alice") == "plus"
    assert await _badge(alice, "bob") == "pro"

    # In a game, each player's badge shows by their name.
    game = (await alice.http.post("/api/v1/games/computer", json={"level": "easy"})).json()
    mine = game["goat"] if game["goat"]["username"] == "alice" else game["tiger"]
    theirs = game["tiger"] if mine is game["goat"] else game["goat"]
    assert (mine["badge"], theirs["badge"]) == ("plus", None)

    # Hidden on request.
    await alice.http.patch(URL, json={**FREE, "show_badge": False})
    assert await _badge(bob, "alice") is None

    # The badge feature granted on its own shows as Plus.
    await boss.http.post(
        "/api/v1/admin/players/boss/grants", json={"feature": "badge", "days": None, "reason": "x"}
    )
    assert await _badge(alice, "boss") == "plus"


async def test_a_change_keeps_the_rest(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    await give_plan(app, alice)
    await alice.http.patch(URL, json={"board": "jade"})
    r = await alice.http.patch(URL, json={"sounds_on": False})
    assert r.json() == {**FREE, "board": "jade", "sounds_on": False}
    r = await alice.http.patch(URL, json={})
    assert r.json() == {**FREE, "board": "jade", "sounds_on": False}
    # The free choice of each is always allowed, even on its own.
    bob = await players("bob")
    assert (await bob.http.patch(URL, json={"sounds": "gentle"})).status_code == 200
    assert (await bob.http.patch(URL, json={"sounds": "arcade"})).status_code == 403
