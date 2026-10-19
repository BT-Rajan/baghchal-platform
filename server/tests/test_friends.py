"""Friends: a request and an answer, then each on the other's list."""

from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from baghchal_server.friends import service

from .conftest import PASSWORD, Player, PlayerFactory
from .test_games import _event, _online

URL = "/api/v1/friends"


async def _lists(player: Player) -> dict[str, Any]:
    r = await player.http.get(URL)
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


def _names(players: list[dict[str, Any]]) -> list[str]:
    return [p["username"] for p in players]


async def _relation(viewer: Player, username: str) -> str:
    return str((await viewer.http.get(f"/api/v1/players/{username}")).json()["friend"])


async def test_a_request_and_an_answer(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        _, bob_ws = await _online(app, stack, alice, bob)
        r = await alice.http.post(f"{URL}/bob")
        assert r.json() == {"relation": "requested"}
        await _event(bob_ws, "friends")  # bob hears of it at once
        assert _names((await _lists(alice))["outgoing"]) == ["bob"]
        assert _names((await _lists(bob))["incoming"]) == ["alice"]
        assert (await _relation(alice, "bob"), await _relation(bob, "alice")) == (
            "requested",
            "incoming",
        )
        # Asking again changes nothing; bob asking back is accepting.
        assert (await alice.http.post(f"{URL}/bob")).json() == {"relation": "requested"}
        assert (await bob.http.post(f"{URL}/alice")).json() == {"relation": "friends"}
        assert (await alice.http.post(f"{URL}/bob")).json() == {"relation": "friends"}

        lists = await _lists(alice)
        assert (lists["incoming"], lists["outgoing"]) == ([], [])
        (friend,) = lists["friends"]
        assert (friend["username"], friend["online"], friend["playing"]) == ("bob", True, False)
        assert await _relation(bob, "alice") == "friends"


async def test_friends_online_come_first(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    for friend in (bob, carol):
        await alice.http.post(f"{URL}/{friend.username}")
        await friend.http.post(f"{URL}/alice")
    assert _names((await _lists(alice))["friends"]) == ["bob", "carol"]
    async with AsyncExitStack() as stack:
        await _online(app, stack, carol)
        assert _names((await _lists(alice))["friends"]) == ["carol", "bob"]


async def test_declining_cancelling_and_unfriending(players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    await alice.http.post(f"{URL}/bob")
    assert (await bob.http.delete(f"{URL}/alice")).status_code == 204  # declined
    assert await _relation(alice, "bob") == "none"
    await alice.http.post(f"{URL}/bob")
    assert (await alice.http.delete(f"{URL}/bob")).status_code == 204  # cancelled
    assert (await _lists(bob))["incoming"] == []
    await alice.http.post(f"{URL}/bob")
    await bob.http.post(f"{URL}/alice")
    assert (await alice.http.delete(f"{URL}/bob")).status_code == 204  # unfriended
    assert (await _lists(bob))["friends"] == []
    # Nothing to remove is fine.
    assert (await alice.http.delete(f"{URL}/bob")).status_code == 204


async def test_who_cannot_be_added(app_client: httpx.AsyncClient, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    for username, code in (("alice", "cannot_friend_self"), ("nobody", "player_not_found")):
        r = await alice.http.post(f"{URL}/{username}")
        assert r.json()["error"]["code"] == code
    guest = (await app_client.post("/api/v1/auth/guest", json={"transport": "bearer"})).json()
    r = await alice.http.post(f"{URL}/{guest['user']['username']}")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "guest_has_no_friends")
    # Guests have no friends to list, and cannot ask.
    auth = {"Authorization": f"Bearer {guest['token']}"}
    assert (await app_client.get(URL, headers=auth)).json() == {
        "friends": [],
        "incoming": [],
        "outgoing": [],
    }
    r = await app_client.post(f"{URL}/alice", headers=auth)
    assert r.status_code == 403

    # A block ends a friendship, and stops requests either way.
    await alice.http.post(f"{URL}/bob")
    await bob.http.post(f"{URL}/alice")
    assert (await alice.http.put("/api/v1/blocks/bob")).status_code == 204
    assert (await _lists(bob))["friends"] == []
    for asker, other in ((alice, "bob"), (bob, "alice")):
        r = await asker.http.post(f"{URL}/{other}")
        assert (r.status_code, r.json()["error"]["code"]) == (403, "friend_refused")


async def test_limits(players: PlayerFactory, monkeypatch: pytest.MonkeyPatch) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    monkeypatch.setattr(service, "MAX_REQUESTS", 1)
    await alice.http.post(f"{URL}/bob")
    r = await alice.http.post(f"{URL}/carol")
    assert (r.status_code, r.json()["error"]["code"]) == (429, "too_many_friend_requests")

    monkeypatch.setattr(service, "MAX_FRIENDS", 1)
    await bob.http.post(f"{URL}/alice")  # alice and bob are friends: both are full
    r = await carol.http.post(f"{URL}/alice")
    assert r.json()["error"]["message"] == "alice has 1 friends already."
    await alice.http.delete(f"{URL}/bob")
    await carol.http.post(f"{URL}/bob")
    await bob.http.post(f"{URL}/alice")  # a new request: carol's is waiting on bob
    monkeypatch.setattr(service, "MAX_REQUESTS", 5)
    await carol.http.post(f"{URL}/alice")
    await alice.http.post(f"{URL}/carol")  # accept carol: alice now has one friend
    r = await alice.http.post(f"{URL}/bob")  # accepting bob would be one too many
    assert r.json()["error"]["message"] == "You have 1 friends already."


async def test_asking_at_the_same_moment(
    players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await alice.http.post(f"{URL}/bob")

    real = service._row
    calls = 0

    async def late(*args: Any) -> Any:
        nonlocal calls
        calls += 1
        return None if calls == 1 else await real(*args)

    # bob's request does not see alice's yet, so it clashes with it when saved; it then
    # reports alice's request as it is.
    monkeypatch.setattr(service, "_row", late)
    r = await bob.http.post(f"{URL}/alice")
    assert r.json() == {"relation": "incoming"}


async def test_export_and_deletion(players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    await players("carol")
    await alice.http.post(f"{URL}/bob")
    await bob.http.post(f"{URL}/alice")
    await alice.http.post(f"{URL}/carol")  # only a request: not a friend
    assert (await alice.http.get("/api/v1/me/export")).json()["friends"] == ["bob"]

    r = await bob.http.post("/api/v1/me/delete", json={"password": PASSWORD})
    assert r.status_code == 204
    assert (await _lists(alice))["friends"] == []
    assert _names((await _lists(alice))["outgoing"]) == ["carol"]
