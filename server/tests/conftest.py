"""Server test fixtures.

Tests run against ``BAGHCHAL_TEST_DATABASE_URL`` (a fresh SQLite file by default). The schema
is built with the real Alembic migrations, and every table is emptied between tests.
"""

import os
import re
import subprocess
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from httpx_ws import AsyncWebSocketSession, aconnect_ws
from httpx_ws.transport import ASGIWebSocketTransport
from sqlalchemy import text

from baghchal_server.app import create_app
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer
from baghchal_server.payments.gateway import Gateway
from baghchal_server.ratelimit import MemoryRateLimiter

SERVER_DIR = Path(__file__).resolve().parents[1]
ORIGIN = "http://localhost:8081"
PASSWORD = "correct horse battery"


@pytest.fixture(scope="session")
def database_url(tmp_path_factory: pytest.TempPathFactory) -> str:
    url = os.environ.get("BAGHCHAL_TEST_DATABASE_URL") or (
        f"sqlite+aiosqlite:///{tmp_path_factory.mktemp('db') / 'test.db'}"
    )
    env = {**os.environ, "BAGHCHAL_DATABASE_URL": url}

    def alembic(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(  # noqa: S603 - fixed command line
            [sys.executable, "-m", "alembic", *args],
            cwd=SERVER_DIR,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    for args in (("downgrade", "base"), ("upgrade", "head"), ("check",)):
        result = alembic(*args)
        assert result.returncode == 0, f"alembic {' '.join(args)} failed:\n{result.stderr}"
    return url


@dataclass
class Clock:
    now: datetime = field(default_factory=lambda: datetime(2026, 1, 1, 12, tzinfo=UTC))

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def mailer() -> MemoryMailer:
    return MemoryMailer()


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(
        environment="test",
        database_url=database_url,
        database_pool_size=2,
        mail_backend="memory",
        allowed_origins=(ORIGIN,),
        game_sweeper=False,  # tests call the sweeper directly
        computer_workers=0,  # think in a thread: no processes to start
    )


@pytest.fixture
def gateway() -> Gateway | None:
    """No payments, unless a test module provides a gateway (and Razorpay settings)."""
    return None


@pytest.fixture
async def app(
    settings: Settings, mailer: MemoryMailer, clock: Clock, gateway: Gateway | None
) -> AsyncIterator[FastAPI]:
    app = create_app(
        settings, mailer=mailer, limiter=MemoryRateLimiter(), clock=clock, gateway=gateway
    )
    async with app.router.lifespan_context(app):
        yield app
        state: AppState = app.state.ctx
        async with state.engine.begin() as conn:
            for table in (
                "analysis_uses",
                "analyses",
                "active_games",
                "game_moves",
                "games",
                "matches",
                "ratings",
                "challenges",
                "blocks",
                "seeks",
                "reports",
                "moderation_actions",
                "payments",
                "grants",
                "appearances",
                "sessions",
                "email_tokens",
                "users",
            ):
                await conn.execute(text(f"DELETE FROM {table}"))  # noqa: S608 - fixed names


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """A browser-like client: sends the allowed Origin and keeps cookies."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        headers={"origin": ORIGIN},
    ) as c:
        yield c


@pytest.fixture
async def app_client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """A native-app-like client: no Origin header, no cookies kept."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as c:
        yield c


def last_token(mailer: MemoryMailer) -> str:
    match = re.search(r"token=([A-Za-z0-9_-]{43})", mailer.outbox[-1].body)
    assert match, mailer.outbox[-1].body
    return match.group(1)


async def sign_up(
    client: httpx.AsyncClient,
    mailer: MemoryMailer,
    username: str = "alice",
    email: str = "alice@example.com",
    password: str = PASSWORD,
) -> httpx.Response:
    """Register and verify an account; returns the verify response (which signs in)."""
    r = await client.post(
        "/api/v1/auth/register", json={"username": username, "email": email, "password": password}
    )
    assert r.status_code == 202, r.text
    r = await client.post("/api/v1/auth/verify-email", json={"token": last_token(mailer)})
    assert r.status_code == 200, r.text
    return r


@dataclass
class Player:
    """A signed-in user of a native app: a client that sends its bearer token."""

    id: str
    username: str
    http: httpx.AsyncClient

    @property
    def auth(self) -> dict[str, str]:
        return {"authorization": self.http.headers["authorization"]}


@asynccontextmanager
async def open_socket(
    app: FastAPI, headers: dict[str, str] | None = None, cookies: httpx.Cookies | None = None
) -> AsyncIterator[AsyncWebSocketSession]:
    """Open the lobby WebSocket. Must be entered and left in the same task."""
    async with httpx.AsyncClient(
        transport=ASGIWebSocketTransport(app), base_url="http://testserver", cookies=cookies
    ) as http:
        connect: AbstractAsyncContextManager[AsyncWebSocketSession] = aconnect_ws(
            "/api/v1/ws", http, headers=headers
        )
        async with connect as ws:
            yield ws


PlayerFactory = Callable[[str], Awaitable[Player]]


@pytest.fixture
async def players(app: FastAPI, mailer: MemoryMailer) -> AsyncIterator[PlayerFactory]:
    clients: list[httpx.AsyncClient] = []

    async def make(username: str) -> Player:
        http = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        )
        clients.append(http)
        r = await http.post(
            "/api/v1/auth/register",
            json={"username": username, "email": f"{username}@example.com", "password": PASSWORD},
        )
        assert r.status_code == 202, r.text
        r = await http.post(
            "/api/v1/auth/verify-email", json={"token": last_token(mailer), "transport": "bearer"}
        )
        assert r.status_code == 200, r.text
        body = r.json()
        http.headers["authorization"] = f"Bearer {body['token']}"
        return Player(body["user"]["id"], username, http)

    yield make
    for http in clients:
        await http.aclose()
