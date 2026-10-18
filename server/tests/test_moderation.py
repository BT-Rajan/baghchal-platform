"""Reports, moderators, suspensions, renames and the username word list."""

import asyncio
from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import username_allowed
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer
from baghchal_server.moderation import service as moderation_service
from baghchal_server.moderators import USAGE, main, run

from .conftest import PASSWORD, Clock, Player, PlayerFactory
from .test_games import _event, _online, _start

MOD = "/api/v1/mod"


async def _login(app: FastAPI, login: str) -> httpx.Response:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as http:
        return await http.post(
            "/api/v1/auth/login", json={"login": login, "password": PASSWORD, "transport": "bearer"}
        )


@pytest.fixture
async def moderator(players: PlayerFactory, settings: Settings) -> Player:
    mod = await players("warden")
    assert await run(settings, ["grant", "warden"]) == "warden is now a moderator."
    return mod


async def _report(reporter: Player, target: str, **body: Any) -> httpx.Response:
    return await reporter.http.post(
        f"/api/v1/players/{target}/report", json={"reason": "abuse", **body}
    )


async def _suspend(mod: Player, target: str, days: int | None = 7, reason: str = "abuse") -> Any:
    r = await mod.http.post(
        f"{MOD}/players/{target}/suspend", json={"days": days, "reason": reason}
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── Reporting ─────────────────────────────────────────────────────────────


async def test_reporting_a_player(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    r = await _report(alice, "bob", reason="cheating", details="  engine moves  ")
    assert r.status_code == 202, r.text
    assert (await _report(alice, "bob")).status_code == 202  # kept as one open report
    assert (await _report(alice, "alice")).json()["error"]["code"] == "cannot_report_self"
    assert (await _report(alice, "nobody")).status_code == 404
    assert (await _report(alice, "bob", reason="spam")).status_code == 422
    assert (await _report(alice, "bob", details="x" * 1001)).status_code == 422
    assert (await bob.http.get(f"{MOD}/reports")).json()["error"]["code"] == "not_a_moderator"


async def test_the_same_report_twice_at_once_is_kept_once(
    app: FastAPI, players: PlayerFactory, moderator: Player, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = await players("alice")
    await players("bob")
    assert (await _report(alice, "bob")).status_code == 202

    async def not_yet(*_: object) -> bool:  # as if the other request had not committed yet
        return False

    monkeypatch.setattr(moderation_service, "has_open_report", not_yet)
    assert (await _report(alice, "bob")).status_code == 202
    monkeypatch.undo()
    assert len((await moderator.http.get(f"{MOD}/reports")).json()) == 1


async def test_a_report_can_point_at_a_game_between_the_two(
    app: FastAPI, players: PlayerFactory, moderator: Player
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
    r = await _report(carol, "bob", game_id=game["id"])
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_game")
    r = await _report(carol, "bob", game_id="00000000-0000-4000-8000-00000000dead")
    assert r.json()["error"]["code"] == "invalid_game"
    assert (await _report(alice, "bob", game_id=game["id"])).status_code == 202
    (listed,) = (await moderator.http.get(f"{MOD}/reports")).json()
    assert listed["game_id"] == game["id"]


async def test_reports_are_limited(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    for i in range(20):
        await players(f"p{i:02}x")
        assert (await _report(alice, f"p{i:02}x")).status_code == 202
    assert (await _report(alice, "p00x")).status_code == 429


# ── The queue ─────────────────────────────────────────────────────────────


async def test_the_report_queue(
    app: FastAPI, players: PlayerFactory, moderator: Player, clock: Clock
) -> None:
    alice, carol, _ = await players("alice"), await players("carol"), await players("bob")
    await _report(alice, "bob", reason="username", details="rude name")
    clock.advance(minutes=1)
    await _report(carol, "bob", reason="abuse")
    clock.advance(minutes=1)
    await _report(alice, "carol")

    queue = (await moderator.http.get(f"{MOD}/reports")).json()
    assert [(r["reporter"]["username"], r["target"]["username"]) for r in queue] == [
        ("alice", "bob"),
        ("carol", "bob"),
        ("alice", "carol"),
    ]
    assert [r["open_reports_against_target"] for r in queue] == [2, 2, 1]
    assert queue[0]["reason"] == "username"
    assert queue[0]["details"] == "rude name"

    r = await moderator.http.post(
        f"{MOD}/reports/{queue[2]['id']}/dismiss", json={"reason": "  just a lost game  "}
    )
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["open_reports_against_target"]) == ("dismissed", 0)
    again = await moderator.http.post(
        f"{MOD}/reports/{queue[2]['id']}/dismiss", json={"reason": "again"}
    )
    assert (again.status_code, again.json()["error"]["code"]) == (409, "report_closed")
    missing = await moderator.http.post(
        f"{MOD}/reports/00000000-0000-4000-8000-00000000dead/dismiss", json={"reason": "x"}
    )
    assert missing.status_code == 404
    blank = await moderator.http.post(
        f"{MOD}/reports/{queue[0]['id']}/dismiss", json={"reason": " "}
    )
    assert blank.status_code == 422

    closed = (await moderator.http.get(f"{MOD}/reports", params={"status": "dismissed"})).json()
    assert [r["target"]["username"] for r in closed] == ["carol"]
    record = (await moderator.http.get(f"{MOD}/players/carol")).json()
    assert record["actions"] == [
        {
            "action": "dismiss_report",
            "reason": "just a lost game",
            "moderator": "warden",
            "created_at": record["actions"][0]["created_at"],
        }
    ]
    # Once dismissed, the same person may report again.
    assert (await _report(alice, "carol")).status_code == 202
    assert len((await moderator.http.get(f"{MOD}/reports")).json()) == 3


# ── Suspensions ───────────────────────────────────────────────────────────


async def test_suspending_a_player(
    app: FastAPI, players: PlayerFactory, moderator: Player, mailer: MemoryMailer, clock: Clock
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    await _report(alice, "bob", details="insults in chat")
    async with AsyncExitStack() as stack:
        _, carol_ws = await _online(app, stack, bob, carol)
        await _start(carol, bob)  # carol plays goats
        record = await _suspend(moderator, "bob", days=7, reason="Insulting other players.")
        ended = await _event(carol_ws, "game")
        while ended["game"]["status"] != "finished":
            ended = await _event(carol_ws, "game")
        assert ended["game"]["result"] == {"winner": "goat", "reason": "resigned"}

    assert record["suspended_until"] is not None
    assert record["banned"] is False
    assert record["suspension_reason"] == "Insulting other players."
    assert record["reports"][0]["status"] == "actioned"
    assert record["actions"][0]["action"] == "suspend"
    assert (await bob.http.get("/api/v1/me")).status_code == 401  # signed out everywhere
    r = await _login(app, "bob")
    assert (r.status_code, r.json()["error"]["code"]) == (403, "account_suspended")
    assert r.json()["error"]["message"] == (
        "This account is suspended until 08 January 2026, 12:00 UTC. "
        "Reason: Insulting other players."
    )
    mail = mailer.outbox[-1]
    assert (mail.to, mail.subject) == (
        "bob@example.com",
        "Your ClawPlay account has been suspended",
    )
    assert "suspended until 08 January 2026, 12:00 UTC (7 days)" in mail.body

    # Hidden from the lobby while suspended.
    assert (await alice.http.get("/api/v1/players/bob")).status_code == 404
    assert (await alice.http.get("/api/v1/players", params={"prefix": "b"})).json() == []
    assert (await _report(alice, "bob")).status_code == 404

    clock.advance(days=7)
    assert (await _login(app, "bob")).status_code == 200
    assert (await alice.http.get("/api/v1/players/bob")).status_code == 200


async def test_a_ban_closes_open_challenges(
    app: FastAPI, players: PlayerFactory, moderator: Player
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        alice_ws, _, carol_ws = await _online(app, stack, alice, bob, carol)
        to_bob = await carol.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "5+3"}
        )
        from_bob = await bob.http.post(
            "/api/v1/challenges", json={"opponent": "alice", "time_control": "5+3"}
        )
        assert (to_bob.status_code, from_bob.status_code) == (201, 201)
        await _suspend(moderator, "bob", days=None, reason="Cheating with an engine.")
        for ws, challenge, status in (
            (carol_ws, to_bob, "declined"),
            (alice_ws, from_bob, "cancelled"),
        ):
            event = await _event(ws, "challenge")
            while event["challenge"]["id"] != challenge.json()["id"] or (
                event["challenge"]["status"] == "pending"
            ):
                event = await _event(ws, "challenge")
            assert event["challenge"]["status"] == status
    r = await _login(app, "bob")
    assert r.json()["error"]["message"] == (
        "This account has been banned. Reason: Cheating with an engine."
    )
    assert (await moderator.http.get(f"{MOD}/players/bob")).json()["banned"] is True


async def test_a_suspended_players_match_is_resigned_game_by_game(
    app: FastAPI, players: PlayerFactory, moderator: Player
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "5+3", "rated": True}
        )
        r = await bob.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
        assert r.status_code == 200, r.text
        first = r.json()["game_id"]
        await _suspend(moderator, "bob", days=1)
    # Game 1 was resigned, which started game 2; that was resigned too.
    assert (await alice.http.get("/api/v1/games")).json() == []
    game = (await alice.http.get(f"/api/v1/games/{first}")).json()
    assert game["result"]["reason"] == "resigned"
    second = [g for g in game["match"]["games"] if g != first]
    assert len(second) == 1
    other = (await alice.http.get(f"/api/v1/games/{second[0]}")).json()
    assert other["result"]["reason"] == "resigned"


async def test_lifting_a_suspension(
    app: FastAPI, players: PlayerFactory, moderator: Player, mailer: MemoryMailer, clock: Clock
) -> None:
    await players("bob")
    r = await moderator.http.post(f"{MOD}/players/bob/unsuspend", json={"reason": "x"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "not_suspended")
    await _suspend(moderator, "bob", days=None)
    clock.advance(minutes=1)  # the log lists newest first
    r = await moderator.http.post(
        f"{MOD}/players/bob/unsuspend", json={"reason": "Appeal accepted."}
    )
    assert r.status_code == 200, r.text
    assert (r.json()["suspended_until"], r.json()["banned"]) == (None, False)
    assert [a["action"] for a in r.json()["actions"]] == ["unsuspend", "suspend"]
    assert mailer.outbox[-1].subject == "Your ClawPlay account is active again"
    assert (await _login(app, "bob")).status_code == 200


async def test_who_can_be_moderated(
    app: FastAPI, players: PlayerFactory, moderator: Player, settings: Settings
) -> None:
    await players("othermod")
    await players("bob")
    await run(settings, ["grant", "othermod"])
    r = await moderator.http.post(f"{MOD}/players/warden/suspend", json={"days": 1, "reason": "x"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "cannot_moderate_self")
    r = await moderator.http.post(
        f"{MOD}/players/othermod/suspend", json={"days": 1, "reason": "x"}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (403, "cannot_moderate_moderator")
    r = await moderator.http.post(f"{MOD}/players/bob/suspend", json={"days": 0, "reason": "x"})
    assert r.status_code == 422
    assert (await moderator.http.get(f"{MOD}/players/nobody")).status_code == 404


async def test_a_deleted_account_cannot_be_moderated(
    app: FastAPI, players: PlayerFactory, moderator: Player
) -> None:
    gone = await players("gone")
    await gone.http.post("/api/v1/me/delete", json={"password": PASSWORD})
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        name = await db.scalar(select(User.username).where(User.deleted_at.is_not(None)))
    record = (await moderator.http.get(f"{MOD}/players/{name}")).json()
    assert record["deleted"] is True
    r = await moderator.http.post(f"{MOD}/players/{name}/suspend", json={"days": 1, "reason": "x"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "account_deleted")


# ── Renames and the username word list ────────────────────────────────────


async def test_renaming_an_offensive_username(
    app: FastAPI, players: PlayerFactory, moderator: Player, mailer: MemoryMailer
) -> None:
    alice, _, _ = await players("alice"), await players("rudename"), await players("taken")
    r = await moderator.http.post(
        f"{MOD}/players/rudename/rename", json={"username": "taken", "reason": "x"}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (409, "username_taken")
    r = await moderator.http.post(
        f"{MOD}/players/rudename/rename", json={"username": "admin", "reason": "x"}
    )
    assert r.json()["error"]["code"] == "username_unavailable"
    r = await moderator.http.post(
        f"{MOD}/players/rudename/rename",
        json={"username": "Player-1234", "reason": "Offensive username."},
    )
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "Player-1234"
    assert r.json()["actions"][0]["reason"] == "rudename → Player-1234: Offensive username."
    assert mailer.outbox[-1].subject == "Your ClawPlay username was changed"
    assert "from rudename to Player-1234" in mailer.outbox[-1].body
    assert (await alice.http.get("/api/v1/players/player-1234")).status_code == 200
    assert (await alice.http.get("/api/v1/players/rudename")).status_code == 404
    assert (await _login(app, "Player-1234")).status_code == 200
    # Renaming to the same name in other letter case is allowed.
    r = await moderator.http.post(
        f"{MOD}/players/player-1234/rename", json={"username": "player-1234", "reason": "case"}
    )
    assert r.status_code == 200


def test_the_username_word_list(settings: Settings) -> None:
    strict = settings.model_copy(update={"blocked_username_words": ("Rude",)})
    assert username_allowed(strict, "alice")
    for name in ("rudeboy", "XRUDEx", "r_u-d3e", "r-u_d_e99"):
        assert not username_allowed(strict, name), name
    assert not username_allowed(settings, "admin")
    assert not username_allowed(settings, "deleted-123")


class TestWithAWordList:
    @pytest.fixture
    def settings(self, settings: Settings) -> Settings:
        return settings.model_copy(update={"blocked_username_words": ("rude",)})

    async def test_registration_checks_it(self, client: httpx.AsyncClient) -> None:
        r = await client.post(
            "/api/v1/auth/register",
            json={"username": "VeryRude", "email": "v@example.com", "password": PASSWORD},
        )
        assert (r.status_code, r.json()["error"]["code"]) == (409, "username_unavailable")

    async def test_renames_check_it_too(self, players: PlayerFactory, moderator: Player) -> None:
        await players("bob")
        r = await moderator.http.post(
            f"{MOD}/players/bob/rename", json={"username": "rude-bob", "reason": "x"}
        )
        assert r.json()["error"]["code"] == "username_unavailable"


# ── Roles ─────────────────────────────────────────────────────────────────


async def test_granting_and_revoking_the_role(
    app: FastAPI,
    players: PlayerFactory,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    alice = await players("alice")
    assert (await alice.http.get("/api/v1/me")).json()["role"] == "player"
    assert await run(settings, ["list"]) == "No moderators."
    assert await run(settings, ["grant", "ALICE"]) == "alice is now a moderator."
    assert (await alice.http.get("/api/v1/me")).json()["role"] == "moderator"
    assert (await alice.http.get(f"{MOD}/reports")).status_code == 200
    assert await run(settings, ["list"]) == "alice"
    assert await run(settings, ["revoke", "alice"]) == "alice is now a player."
    assert (await alice.http.get(f"{MOD}/reports")).status_code == 403
    for argv in ([], ["grant"], ["promote", "alice"]):
        with pytest.raises(SystemExit, match=USAGE):
            await run(settings, argv)
    with pytest.raises(SystemExit, match="No such player: nobody"):
        await run(settings, ["grant", "nobody"])

    # The command line itself, with the server's settings from the environment. It runs its
    # own event loop, so it gets a thread of its own.
    monkeypatch.setenv("BAGHCHAL_DATABASE_URL", settings.database_url)
    capsys.readouterr()
    await asyncio.to_thread(main, ["list"])
    assert capsys.readouterr().out.splitlines()[-1] == "No moderators."
