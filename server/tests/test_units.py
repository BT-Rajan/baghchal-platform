"""Unit tests for building blocks that the HTTP tests cannot reach directly."""

import importlib
import os
import time
from datetime import UTC, datetime
from email.message import EmailMessage
from typing import Any

import aiosmtplib
import httpx
import pytest
from redis.asyncio import Redis
from sqlalchemy.dialects import sqlite
from starlette.types import Message, Receive, Scope, Send

from baghchal_server.app import create_app
from baghchal_server.config import Settings
from baghchal_server.db import UTCDateTime
from baghchal_server.mail import ConsoleMailer, Mail, MemoryMailer, SmtpMailer, deliver, make_mailer
from baghchal_server.middleware import BodyLimit, CrossSiteGuard, RequestContext, SecurityHeaders
from baghchal_server.ratelimit import Limit, MemoryRateLimiter, RedisRateLimiter

REDIS_URL = os.environ.get("BAGHCHAL_TEST_REDIS_URL")
needs_redis = pytest.mark.skipif(not REDIS_URL, reason="set BAGHCHAL_TEST_REDIS_URL")


# ── Database types ────────────────────────────────────────────────────────


def test_utc_datetime_round_trip() -> None:
    t = UTCDateTime()
    dialect = sqlite.dialect()
    aware = datetime(2026, 5, 1, 12, 30, tzinfo=UTC)
    stored = t.process_bind_param(aware, dialect)
    assert stored == datetime(2026, 5, 1, 12, 30)
    assert t.process_result_value(stored, dialect) == aware
    assert t.process_bind_param(None, dialect) is None
    assert t.process_result_value(None, dialect) is None
    with pytest.raises(ValueError, match="naive"):
        t.process_bind_param(datetime(2026, 5, 1), dialect)


# ── Middleware outside HTTP ───────────────────────────────────────────────


async def _app(scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] == "http":
        first = await receive()
        second = await receive()
        body = first.get("body", b"") + second["type"].encode()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": body})


async def _call(middleware: Any, scope: Scope, messages: list[Message]) -> list[Message]:
    sent: list[Message] = []
    queue = list(messages)

    async def receive() -> Message:
        return queue.pop(0) if queue else {"type": "http.disconnect"}

    async def send(message: Message) -> None:
        sent.append(message)

    await middleware(scope, receive, send)
    return sent


@pytest.mark.parametrize(
    "middleware",
    [
        RequestContext(_app),
        SecurityHeaders(_app, hsts=True),
        CrossSiteGuard(_app, ["https://a.example"]),
        BodyLimit(_app, 10),
    ],
)
async def test_middleware_ignores_non_http_scopes(middleware: Any) -> None:
    assert await _call(middleware, {"type": "lifespan"}, []) == []


async def test_hsts_in_production() -> None:
    scope = {"type": "http", "method": "GET", "headers": []}
    sent = await _call(SecurityHeaders(_app, hsts=True), scope, [{"type": "http.request"}])
    assert (b"strict-transport-security", b"max-age=63072000; includeSubDomains") in sent[0][
        "headers"
    ]


async def test_body_limit_replays_the_body_then_passes_through() -> None:
    scope = {"type": "http", "method": "POST", "headers": []}
    messages: list[Message] = [
        {"type": "http.request", "body": b"ab", "more_body": True},
        {"type": "http.request", "body": b"cd", "more_body": False},
    ]
    sent = await _call(BodyLimit(_app, 10), scope, messages)
    assert sent[1]["body"] == b"abcd" + b"http.disconnect"


async def test_body_limit_handles_client_disconnect() -> None:
    scope = {"type": "http", "method": "POST", "headers": []}
    assert await _call(BodyLimit(_app, 10), scope, [{"type": "http.disconnect"}]) == []


# ── Mail ──────────────────────────────────────────────────────────────────


async def test_make_mailer() -> None:
    assert isinstance(make_mailer(Settings(mail_backend="memory")), MemoryMailer)
    assert isinstance(make_mailer(Settings(mail_backend="console")), ConsoleMailer)
    assert isinstance(
        make_mailer(Settings(mail_backend="smtp", smtp_host="smtp.example.com")), SmtpMailer
    )
    await ConsoleMailer().send(Mail("a@example.com", "Subject", "Body"))


async def test_smtp_mailer(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_send(message: EmailMessage, **kwargs: Any) -> None:
        captured["message"] = message
        captured.update(kwargs)

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    settings = Settings(
        mail_backend="smtp",
        smtp_host="smtp.example.com",
        smtp_username="user",
        smtp_password="secret",
        mail_from="Bagh Chal <no-reply@baghchal.example>",
    )
    await SmtpMailer(settings).send(Mail("a@example.com", "Hello", "Body text"))
    message = captured["message"]
    assert message["To"] == "a@example.com"
    assert message["From"] == "Bagh Chal <no-reply@baghchal.example>"
    assert message["Subject"] == "Hello"
    assert message.get_content().strip() == "Body text"
    assert captured["hostname"] == "smtp.example.com"
    assert captured["username"] == "user"
    assert captured["password"] == "secret"
    assert captured["start_tls"] is True


async def test_delivery_failures_are_logged_not_raised() -> None:
    class Broken:
        async def send(self, mail: Mail) -> None:
            raise ConnectionError("smtp down")

    await deliver(Broken(), Mail("a@example.com", "s", "b"))


# ── Rate limiting ─────────────────────────────────────────────────────────


async def test_memory_limiter_starts_a_new_window(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 1_000_000.0
    monkeypatch.setattr(time, "time", lambda: now)
    limiter = MemoryRateLimiter()
    limit = Limit("t", 1, 60)
    assert await limiter.hit(limit, "k") == 0
    assert await limiter.hit(limit, "k") == 20  # window ends at 1_000_020
    now += 60
    assert await limiter.hit(limit, "k") == 0


@needs_redis
async def test_redis_limiter() -> None:
    assert REDIS_URL
    redis = Redis.from_url(REDIS_URL)
    try:
        limiter = RedisRateLimiter(redis)
        limit = Limit(f"test-{time.time_ns()}", 2, 60)
        assert await limiter.hit(limit, "k") == 0
        assert await limiter.hit(limit, "k") == 0
        assert 1 <= await limiter.hit(limit, "k") <= 60
        assert await limiter.hit(limit, "other") == 0
    finally:
        await redis.aclose()


async def _ready(settings: Settings) -> httpx.Response:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            assert isinstance(app.state.ctx.limiter, RedisRateLimiter)
            return await c.get("/health/ready")


@needs_redis
async def test_app_with_redis(database_url: str) -> None:
    settings = Settings(
        environment="test", database_url=database_url, redis_url=REDIS_URL, mail_backend="memory"
    )
    r = await _ready(settings)
    assert r.json() == {"status": "ok", "database": "ok", "redis": "ok"}


async def test_readiness_reports_a_broken_redis(database_url: str) -> None:
    settings = Settings(
        environment="test",
        database_url=database_url,
        redis_url="redis://127.0.0.1:1/0",
        mail_backend="memory",
    )
    r = await _ready(settings)
    assert r.status_code == 503
    assert r.json() == {"status": "failing", "database": "ok", "redis": "failing"}


def test_asgi_entry_point(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BAGHCHAL_ENVIRONMENT", "test")
    asgi = importlib.import_module("baghchal_server.asgi")
    assert asgi.app.title == "Bagh Chal"
