"""Metrics, error tracking and the sweeper lease."""

import asyncio
import os
from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
import sentry_sdk
from fastapi import FastAPI
from pydantic import SecretStr
from redis.asyncio import Redis

from baghchal_server import app as app_module
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.games import sweeper
from baghchal_server.mail import Mail
from baghchal_server.metrics import CountingMailer, Metrics

from .conftest import Clock, Player, PlayerFactory, open_socket
from .test_games import _event, _start

REDIS_URL = os.environ.get("BAGHCHAL_TEST_REDIS_URL")
needs_redis = pytest.mark.skipif(not REDIS_URL, reason="set BAGHCHAL_TEST_REDIS_URL")
TOKEN = "scrape-me-please"


def _sample(text: str, name: str, **labels: str) -> float:
    """The value of one series in Prometheus text output (0 when absent)."""
    wanted = ",".join(f'{k}="{v}"' for k, v in labels.items())
    series = f"{name}{{{wanted}}}" if labels else name
    for line in text.splitlines():
        if line.startswith(series + " "):
            return float(line.split()[-1])
    return 0.0


# ── Metrics ───────────────────────────────────────────────────────────────


async def test_metrics_are_off_without_a_token(client: httpx.AsyncClient) -> None:
    assert (await client.get("/metrics")).status_code == 404


class TestWithMetrics:
    @pytest.fixture
    def settings(self, settings: Settings) -> Settings:
        return settings.model_copy(update={"metrics_token": SecretStr(TOKEN)})

    async def _scrape(self, http: httpx.AsyncClient) -> str:
        r = await http.get("/metrics", headers={"authorization": f"Bearer {TOKEN}"})
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/plain")
        return r.text

    async def test_the_scraper_needs_the_token(self, app_client: httpx.AsyncClient) -> None:
        assert (await app_client.get("/metrics")).status_code == 401
        r = await app_client.get("/metrics", headers={"authorization": "Bearer wrong"})
        assert r.status_code == 401

    async def test_requests_by_route_template(
        self, app_client: httpx.AsyncClient, players: PlayerFactory
    ) -> None:
        alice = await players("alice")
        await alice.http.get("/api/v1/games/00000000-0000-4000-8000-000000000001")
        await alice.http.get("/api/v1/games/00000000-0000-4000-8000-000000000002")
        await app_client.get("/no/such/page")
        text = await self._scrape(app_client)
        route = "/api/v1/games/{game_id}"
        assert (
            _sample(text, "baghchal_http_requests_total", method="GET", route=route, status="404")
            == 2
        )
        assert (
            _sample(
                text, "baghchal_http_requests_total", method="GET", route="unmatched", status="404"
            )
            == 1
        )
        assert (
            _sample(text, "baghchal_http_request_duration_seconds_count", method="GET", route=route)
            == 2
        )
        assert "00000000-0000-4000-8000-000000000001" not in text  # no raw ids in labels

    async def test_live_games_sockets_and_mail(
        self, app: FastAPI, app_client: httpx.AsyncClient, players: PlayerFactory
    ) -> None:
        alice, bob = await players("alice"), await players("bob")
        async with AsyncExitStack() as stack:
            for p in (alice, bob):
                ws = await stack.enter_async_context(open_socket(app, p.auth))
                await _event(ws, "hello")
            await _start(alice, bob)
            text = await self._scrape(app_client)
            assert _sample(text, "baghchal_live_games") == 1
            assert _sample(text, "baghchal_websocket_connections") == 2
        await asyncio.sleep(0)  # let the sockets finish closing
        text = await self._scrape(app_client)
        assert _sample(text, "baghchal_websocket_connections") == 0
        assert _sample(text, "baghchal_mail_total", result="sent") == 2  # two sign-ups

    async def test_rate_limits_are_counted(
        self, app_client: httpx.AsyncClient, players: PlayerFactory
    ) -> None:
        alice: Player = await players("alice")
        for _ in range(11):
            await alice.http.get("/api/v1/me/export")
        text = await self._scrape(app_client)
        assert _sample(text, "baghchal_rate_limited_total", limit="export") == 1

    async def test_the_sweeper_is_counted(
        self, app: FastAPI, app_client: httpx.AsyncClient, players: PlayerFactory, clock: Clock
    ) -> None:
        alice, bob = await players("alice"), await players("bob")
        async with AsyncExitStack() as stack:
            ws = await stack.enter_async_context(open_socket(app, bob.auth))
            await _event(ws, "hello")
            await _start(alice, bob)
        clock.advance(seconds=31)  # nobody made a first move
        task = asyncio.create_task(sweeper.run(app.state.ctx))
        try:
            for _ in range(200):
                if _sample(await self._scrape(app_client), "baghchal_games_ended_on_time_total"):
                    break
                await asyncio.sleep(0.01)
        finally:
            task.cancel()
        text = await self._scrape(app_client)
        assert _sample(text, "baghchal_games_ended_on_time_total") == 1
        assert _sample(text, "baghchal_sweeper_runs_total") >= 1


async def test_failed_mail_is_counted() -> None:
    class Broken:
        async def send(self, mail: Mail) -> None:
            raise OSError("smtp down")

    metrics = Metrics()
    with pytest.raises(OSError, match="smtp down"):
        await CountingMailer(Broken(), metrics).send(Mail("a@example.com", "s", "b"))
    assert metrics.mail.labels("failed")._value.get() == 1


async def test_sweeper_failures_are_counted(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken(state: object) -> int:
        raise RuntimeError("database down")

    monkeypatch.setattr(sweeper, "sweep", broken)
    monkeypatch.setattr(sweeper, "SWEEP_INTERVAL", 0.01)
    task = asyncio.create_task(sweeper.run(app.state.ctx))
    await asyncio.sleep(0.05)
    task.cancel()
    state: AppState = app.state.ctx
    assert state.metrics.sweep_failures._value.get() >= 2


# ── Error tracking ────────────────────────────────────────────────────────


def test_error_tracking_is_off_without_a_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: calls.append(kw))
    app_module.configure_error_tracking(Settings(environment="test"))
    assert calls == []


def test_error_tracking_sends_no_personal_data(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: calls.append(kw))
    app_module.configure_error_tracking(
        Settings(
            environment="test",
            sentry_dsn=SecretStr("https://key@errors.example/1"),
            sentry_traces_sample_rate=0.1,
        )
    )
    assert calls == [
        {
            "dsn": "https://key@errors.example/1",
            "environment": "test",
            "send_default_pii": False,
            "max_request_body_size": "never",
            "traces_sample_rate": 0.1,
        }
    ]


# ── The sweeper lease ─────────────────────────────────────────────────────


async def test_without_redis_every_server_sweeps() -> None:
    assert await sweeper.holds_lease(None, "a")


@needs_redis
async def test_one_server_sweeps_at_a_time(monkeypatch: pytest.MonkeyPatch) -> None:
    assert REDIS_URL is not None
    redis = Redis.from_url(REDIS_URL)
    monkeypatch.setattr(sweeper, "LEASE_KEY", "test:sweeper:lease")
    monkeypatch.setattr(sweeper, "LEASE_MS", 200)
    try:
        await redis.delete("test:sweeper:lease")
        assert await sweeper.holds_lease(redis, "server-a")
        assert not await sweeper.holds_lease(redis, "server-b")
        assert await sweeper.holds_lease(redis, "server-a")  # renewed
        await asyncio.sleep(0.15)
        assert await sweeper.holds_lease(redis, "server-a")  # renewing keeps it
        await asyncio.sleep(0.15)
        assert not await sweeper.holds_lease(redis, "server-b")
        await asyncio.sleep(0.25)  # server-a stopped renewing: server-b takes over
        assert await sweeper.holds_lease(redis, "server-b")
        assert not await sweeper.holds_lease(redis, "server-a")
    finally:
        await redis.delete("test:sweeper:lease")
        await redis.aclose()


async def test_a_server_without_the_lease_does_not_sweep(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    swept = 0

    async def sweep(state: object) -> int:
        nonlocal swept
        swept += 1
        return 0

    async def elsewhere(redis: object, server_id: str) -> bool:
        return False  # another server holds it

    monkeypatch.setattr(sweeper, "sweep", sweep)
    monkeypatch.setattr(sweeper, "holds_lease", elsewhere)
    monkeypatch.setattr(sweeper, "SWEEP_INTERVAL", 0.01)
    task = asyncio.create_task(sweeper.run(app.state.ctx))
    await asyncio.sleep(0.05)
    task.cancel()
    assert swept == 0
