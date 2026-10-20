"""Housekeeping: data past the time the privacy policy keeps it is deleted."""

import asyncio
import uuid
from datetime import timedelta

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select, update

from baghchal_server import housekeeping
from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.app import create_app
from baghchal_server.billing import reminders
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.fair_play.models import CheckStatus, FairPlayCheck, FairPlaySide, Stage
from baghchal_server.mail import Mail, MemoryMailer
from baghchal_server.moderation.models import ModerationAction, Report, ReportStatus
from baghchal_server.payments.models import Payment
from baghchal_server.ratelimit import MemoryRateLimiter

from .conftest import AGREE, PASSWORD, Clock, PlayerFactory
from .test_legal import _minor


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


async def _count(app: FastAPI, model: type) -> int:
    async with _state(app).sessions() as db:
        return (await db.scalar(select(func.count()).select_from(model))) or 0


async def _tidy(app: FastAPI) -> dict[str, int]:
    state = _state(app)
    async with state.sessions() as db:
        return await housekeeping.tidy(db, state.settings, state.clock())


async def test_nothing_is_deleted_before_its_time(app: FastAPI, players: PlayerFactory) -> None:
    await players("alice")
    assert set((await _tidy(app)).values()) == {0}


async def test_everything_past_its_time_goes(
    app: FastAPI,
    players: PlayerFactory,
    mailer: MemoryMailer,
    clock: Clock,
    app_client: httpx.AsyncClient,
) -> None:
    alice = await players("alice")
    alice_id = uuid.UUID(alice.id)
    state = _state(app)
    start = clock()
    # A sign-up never confirmed, and minors whose parents never answer (one is playing).
    r = await app_client.post(
        "/api/v1/auth/register",
        json={**AGREE, "username": "ghost", "email": "ghost@example.com", "password": PASSWORD},
    )
    assert r.status_code == 202
    kid = await _minor(app, mailer)
    busy = await _minor(app, mailer, "busy", "pa@example.com")
    await busy.http.post("/api/v1/games/computer", json={"level": "easy"})
    game = (await alice.http.post("/api/v1/games/computer", json={"level": "easy"})).json()
    await alice.http.post(f"/api/v1/games/{game['id']}/resign")
    game_id = uuid.UUID(game["id"])
    async with state.sessions() as db:
        report = Report(
            reporter_id=None,
            target_id=alice_id,
            reason="cheating",
            details="",
            status=ReportStatus.DISMISSED,
            created_at=start,
            resolved_at=start,
        )
        db.add(report)
        db.add(
            ModerationAction(
                target_id=alice_id, action="dismiss_report", reason="x", created_at=start
            )
        )
        db.add(
            Payment(
                user_id=alice_id,
                plan="plus",
                period="month",
                amount_paise=100,
                order_id="order_1",
                status="paid",
                created_at=start,
            )
        )
        db.add(
            FairPlayCheck(game_id=game_id, status=CheckStatus.DONE, attempts=1, created_at=start)
        )
        db.add(
            FairPlaySide(
                game_id=game_id,
                user_id=alice_id,
                stage=Stage.SCREEN,
                side="goat",
                moves=0,
                decisive=0,
                agreed=0,
                decisive_loss=0,
                mistakes=0,
                blunders=0,
                think_median_ms=0,
                think_spread=0.0,
                fast_moves=0,
                created_at=start,
            )
        )
        await db.commit()

    clock.advance(days=8)
    done = await _tidy(app)
    assert done["unconfirmed_sign_ups"] == 1
    assert done["accounts_without_parent"] == 1  # the one in a live game waits
    assert done["email_links"] >= 2  # the confirmations used 8 days ago
    async with state.sessions() as db:
        kid_row = await db.get(User, uuid.UUID(kid.id))
        busy_row = await db.get(User, uuid.UUID(busy.id))
        assert kid_row is not None
        assert busy_row is not None
        assert (kid_row.is_active, busy_row.is_active) == (False, True)

    clock.advance(days=30)  # the sessions from sign-up expire
    assert (await _tidy(app))["sessions"] >= 1
    clock.advance(days=365)
    done = await _tidy(app)
    assert (done["fair_play_figures"], done["fair_play_checks"]) == (1, 1)
    clock.advance(days=3 * 365)
    done = await _tidy(app)
    assert (done["reports"], done["moderation_actions"]) == (1, 1)
    clock.advance(days=5 * 365)
    assert (await _tidy(app))["payments"] == 1
    for model in (Session, EmailToken, Report, ModerationAction, Payment, FairPlaySide):
        assert await _count(app, model) == 0, model


async def test_pending_minors_are_counted_from_when_they_were_asked(
    app: FastAPI, mailer: MemoryMailer, clock: Clock
) -> None:
    kid = await _minor(app, mailer)
    clock.advance(days=6)
    async with _state(app).sessions() as db:  # asked again (an older account answering now)
        await db.execute(
            update(User).where(User.id == uuid.UUID(kid.id)).values(age_checked_at=clock())
        )
        await db.commit()
    clock.advance(days=2)
    assert (await _tidy(app))["accounts_without_parent"] == 0
    clock.advance(days=6)
    state = _state(app)
    outbox: list[Mail] = []
    async with state.sessions() as db:
        done = await housekeeping.tidy(db, state.settings, state.clock(), outbox)
    assert done["accounts_without_parent"] == 1
    assert [m.subject for m in outbox] == ["Your ClawPlay account was deleted"]


async def test_the_loop_runs_and_survives_errors(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []

    async def tidy(*args: object) -> dict[str, int]:
        calls.append("tidy")
        if len(calls) == 1:
            raise RuntimeError("database away")
        return {"sessions": 2}

    sent: list[Mail] = []

    async def due(*args: object) -> list[Mail]:
        return (
            [Mail("a@example.com", "Your ClawPlay Plus ends soon", "…")] if len(calls) == 2 else []
        )

    async def deliver(mailer: object, mail: Mail) -> None:
        sent.append(mail)

    monkeypatch.setattr(housekeeping, "tidy", tidy)
    monkeypatch.setattr(reminders, "due", due)
    monkeypatch.setattr(housekeeping, "deliver", deliver)
    monkeypatch.setattr(housekeeping, "INTERVAL_SECONDS", 0)
    app = create_app(
        settings.model_copy(update={"housekeeping": True}), limiter=MemoryRateLimiter()
    )
    async with app.router.lifespan_context(app):
        while len(calls) < 3:
            await asyncio.sleep(0.01)
        deleted = _state(app).metrics.housekeeping_deleted.labels("sessions")._value.get()
        assert deleted >= 2
        assert [m.subject for m in sent] == ["Your ClawPlay Plus ends soon"]


def test_the_periods_match_the_policy() -> None:
    assert timedelta(days=7) == housekeeping.UNCONFIRMED
    assert timedelta(days=7) == housekeeping.LINKS
    assert timedelta(days=365) == housekeeping.FAIR_PLAY
    assert timedelta(days=3 * 365) == housekeeping.MODERATION
    assert timedelta(days=8 * 365) == housekeeping.PAYMENTS
