"""Plans and what they unlock, and the admins who grant them."""

import asyncio
import uuid
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import update

from baghchal_server.accounts.models import User
from baghchal_server.billing import service
from baghchal_server.billing.models import Grant
from baghchal_server.billing.plans import Plan
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.games.models import Game
from baghchal_server.mail import MemoryMailer
from baghchal_server.moderators import main, run

from .conftest import Clock, Player, PlayerFactory
from .test_games import _online, _start

COMPUTER = "/api/v1/games/computer"
HARD = {"level": "hard", "side": "tiger"}


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


async def make_admin(app: FastAPI, player: Player) -> None:
    async with _state(app).sessions() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(player.id)).values(role="admin"))
        await db.commit()


async def give_plan(app: FastAPI, player: Player, plan: str = "plus") -> None:
    """Give a test player a plan for good, as an admin would."""
    state = _state(app)
    async with state.sessions() as db:
        now = state.clock()
        db.add(
            Grant(
                user_id=uuid.UUID(player.id),
                plan=plan,
                starts_at=now,
                reason="test",
                created_at=now,
            )
        )
        await db.commit()


async def _grant(admin: Player, username: str, **body: Any) -> Any:
    r = await admin.http.post(
        f"/api/v1/admin/players/{username}/grants", json={"reason": "Tester", **body}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _plan(player: Player) -> Any:
    return (await player.http.get("/api/v1/me/plan")).json()


async def test_the_plans() -> None:
    from baghchal_server.billing.routes import plans  # noqa: PLC0415 - the route itself

    catalogue = {p.plan: p for p in await plans()}
    assert list(catalogue) == ["free", "plus", "pro"]
    assert catalogue[Plan.FREE].features == []
    assert catalogue[Plan.FREE].monthly_paise is None
    assert "computer_hard" in catalogue[Plan.PLUS].features
    assert set(catalogue[Plan.PLUS].features) < set(catalogue[Plan.PRO].features)
    assert (catalogue[Plan.PLUS].monthly_paise, catalogue[Plan.PLUS].analyses_per_day) == (14900, 5)
    assert catalogue[Plan.PRO].analyses_per_day is None


async def test_everyone_starts_free_and_hard_needs_plus(players: PlayerFactory) -> None:
    alice = await players("alice")
    assert await _plan(alice) == {"plan": "free", "plan_until": None, "features": [], "grants": []}
    r = await alice.http.post(COMPUTER, json=HARD)
    assert (r.status_code, r.json()["error"]) == (
        403,
        {"code": "upgrade_required", "message": "The Hard computer comes with ClawPlay Plus."},
    )
    assert (await alice.http.post(COMPUTER, json={"level": "medium"})).status_code == 201


async def test_an_admin_grants_a_plan_for_a_while(
    app: FastAPI, players: PlayerFactory, clock: Clock, mailer: MemoryMailer
) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    grant = await _grant(boss, "ALICE", plan="plus", days=7, reason="Welcome gift")
    assert (grant["plan"], grant["feature"], grant["granted_by"], grant["active"]) == (
        "plus",
        None,
        "boss",
        True,
    )
    assert mailer.outbox[-1].subject == "You have ClawPlay Plus"
    assert "until 08 January 2026" in mailer.outbox[-1].body
    mine = await _plan(alice)
    assert (mine["plan"], mine["plan_until"]) == ("plus", "2026-01-08T12:00:00Z")
    assert "full_history" in mine["features"]
    assert "trainer" not in mine["features"]
    assert (await alice.http.post(COMPUTER, json=HARD)).status_code == 201

    clock.advance(days=7)  # the grant runs out
    assert (await _plan(alice))["plan"] == "free"
    record = (await boss.http.get("/api/v1/admin/players/alice/plan")).json()
    assert [(g["plan"], g["active"]) for g in record["history"]] == [("plus", False)]


async def test_plans_and_features_add_up(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    await _grant(boss, "alice", feature="trainer", days=None)
    mine = await _plan(alice)
    assert (mine["plan"], mine["features"]) == ("free", ["trainer"])
    await _grant(boss, "alice", plan="plus", days=10)
    clock.advance(days=1)
    await _grant(boss, "alice", plan="plus", days=20)
    assert (await _plan(alice))["plan_until"] == "2026-01-22T12:00:00Z"  # the later end
    await _grant(boss, "alice", plan="plus", days=None)
    assert (await _plan(alice))["plan_until"] is None  # one of them lasts for good
    await _grant(boss, "alice", plan="pro", days=5)
    mine = await _plan(alice)
    assert (mine["plan"], mine["plan_until"]) == ("pro", "2026-01-07T12:00:00Z")
    assert len(mine["grants"]) == 5


async def test_revoking(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, clock: Clock
) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    grant = await _grant(boss, "alice", plan="pro", days=None)
    clock.advance(minutes=1)
    revoke = f"/api/v1/admin/grants/{grant['id']}/revoke"
    r = await boss.http.post(revoke, json={"reason": "Ended early"})
    assert (r.status_code, r.json()["active"]) == (200, False)
    assert r.json()["revoked_at"] is not None
    assert mailer.outbox[-1].subject == "Your ClawPlay Pro has ended"
    assert (await _plan(alice))["plan"] == "free"
    r = await boss.http.post(revoke, json={"reason": "Again"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "grant_not_active")
    r = await boss.http.post(f"/api/v1/admin/grants/{uuid.uuid4()}/revoke", json={"reason": "x"})
    assert r.status_code == 404

    # Both show in the player's moderation record.
    record = (await boss.http.get("/api/v1/mod/players/alice")).json()
    assert [(a["action"], a["reason"], a["moderator"]) for a in record["actions"]] == [
        ("revoke", "ClawPlay Pro: Ended early", "boss"),
        ("grant", "ClawPlay Pro: Tester", "boss"),
    ]


async def test_only_admins_grant(app: FastAPI, players: PlayerFactory, settings: Settings) -> None:
    alice, mod = await players("alice"), await players("warden")
    await run(settings, ["grant", "warden"])
    for who in (alice, mod):
        r = await who.http.get("/api/v1/admin/players/alice/plan")
        assert (r.status_code, r.json()["error"]["code"]) == (403, "not_an_admin")
        r = await who.http.post(
            "/api/v1/admin/players/alice/grants", json={"plan": "pro", "days": 1, "reason": "x"}
        )
        assert r.status_code == 403


async def test_what_cannot_be_granted(app: FastAPI, players: PlayerFactory) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    grants = "/api/v1/admin/players/alice/grants"
    for body in (
        {"plan": "plus", "feature": "themes", "days": 1},
        {"days": 1},
        {"plan": "free", "days": 1},
        {"plan": "gold", "days": 1},
        {"plan": "plus", "days": 0},
        {"plan": "plus"},  # say how long, even if for good
    ):
        r = await boss.http.post(grants, json={"reason": "x", **body})
        assert r.status_code == 422, body
    assert (await boss.http.post(grants, json={"plan": "plus", "days": 1})).status_code == 422

    await alice.http.post(COMPUTER, json={"level": "easy"})  # makes the computer's account
    r = await boss.http.post(
        "/api/v1/admin/players/computer-easy/grants",
        json={"plan": "plus", "days": 1, "reason": "x"},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (422, "not_a_player")
    r = await boss.http.post(
        "/api/v1/admin/players/nobody/grants", json={"plan": "plus", "days": 1, "reason": "x"}
    )
    assert r.status_code == 404

    async with _state(app).sessions() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(alice.id)).values(is_active=False))
        await db.commit()
    r = await boss.http.post(grants, json={"plan": "plus", "days": 1, "reason": "x"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "account_deleted")


async def test_admins_also_moderate(app: FastAPI, players: PlayerFactory) -> None:
    boss, alice = await players("boss"), await players("alice")
    await make_admin(app, boss)
    assert (await boss.http.get("/api/v1/me")).json()["role"] == "admin"
    assert (await boss.http.get("/api/v1/mod/reports")).status_code == 200
    r = await alice.http.post("/api/v1/players/boss/report", json={"reason": "abuse"})
    assert r.status_code == 202
    mod = await players("warden")
    await make_admin(app, mod)
    r = await mod.http.post("/api/v1/mod/players/boss/suspend", json={"days": 1, "reason": "x"})
    assert (r.status_code, r.json()["error"]["code"]) == (403, "cannot_moderate_moderator")


async def test_free_history_goes_back_30_days(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        old = await _start(alice, bob)
        await alice.http.post(f"/api/v1/games/{old['id']}/abort")
        clock.advance(minutes=1)
        new = await _start(alice, bob)
        await alice.http.post(f"/api/v1/games/{new['id']}/abort")
    async with _state(app).sessions() as db:  # the first game ended 31 days ago
        await db.execute(
            update(Game)
            .where(Game.id == uuid.UUID(old["id"]))
            .values(finished_at=clock.now - timedelta(days=31))
        )
        await db.commit()
    history = "/api/v1/players/alice/games"
    assert [g["id"] for g in (await bob.http.get(history)).json()] == [new["id"]]
    await give_plan(app, bob)
    assert [g["id"] for g in (await bob.http.get(history)).json()] == [new["id"], old["id"]]


async def test_the_admin_command(
    players: PlayerFactory, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    await players("boss")
    await players("warden")
    assert await run(settings, ["admin", "Boss"]) == "boss is now an admin."
    assert await run(settings, ["grant", "warden"]) == "warden is now a moderator."
    assert await run(settings, ["list"]) == "boss (admin)\nwarden"
    assert await run(settings, ["revoke", "boss"]) == "boss is now a player."
    monkeypatch.setenv("BAGHCHAL_DATABASE_URL", settings.database_url)
    await asyncio.to_thread(main, ["list"])


async def test_entitlements_ignore_grants_not_yet_started(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    state = _state(app)
    async with state.sessions() as db:
        db.add(
            Grant(
                user_id=uuid.UUID(alice.id),
                plan="pro",
                starts_at=clock.now.replace(year=2027),
                reason="later",
                created_at=clock.now,
            )
        )
        await db.commit()
        assert (await service.entitlements(db, uuid.UUID(alice.id), clock())).plan == "free"


def test_the_best_plan_wins_whatever_the_order(clock: Clock) -> None:
    def grant(plan: str, days: int | None) -> Grant:
        ends = None if days is None else clock.now + timedelta(days=days)
        return Grant(plan=plan, starts_at=clock.now, ends_at=ends, reason="x")

    found = service._entitlements([grant("pro", 3), grant("plus", None), grant("pro", None)])
    assert (found.plan, found.plan_until) == (Plan.PRO, None)
    found = service._entitlements([grant("pro", 3), grant("plus", 9)])
    assert (found.plan, found.plan_until) == (Plan.PRO, clock.now + timedelta(days=3))
