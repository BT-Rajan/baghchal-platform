"""Cross-cutting behaviour: security headers, CSRF guard, limits, errors, health, settings."""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from baghchal_server.accounts import routes as account_routes
from baghchal_server.app import create_app
from baghchal_server.config import LEGAL_DETAILS, Settings
from baghchal_server.mail import MemoryMailer
from baghchal_server.ratelimit import Limit, MemoryRateLimiter

from .conftest import AGREE, PASSWORD, sign_up

LOGIN = "/api/v1/auth/login"


async def test_security_headers_and_request_id(client: httpx.AsyncClient) -> None:
    r = await client.get("/health/live")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"
    assert len(r.headers["x-request-id"]) == 32
    assert "strict-transport-security" not in r.headers  # only in production


async def test_request_id_is_echoed_only_when_safe(client: httpx.AsyncClient) -> None:
    r = await client.get("/health/live", headers={"x-request-id": "abc-12345678"})
    assert r.headers["x-request-id"] == "abc-12345678"
    r = await client.get("/health/live", headers={"x-request-id": "bad\x01id"})
    assert r.headers["x-request-id"] != "bad\x01id"


async def test_cross_site_post_is_blocked(client: httpx.AsyncClient) -> None:
    r = await client.post(LOGIN, json={}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden_origin"


async def test_cookie_post_without_origin_is_blocked(
    client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    del client.headers["origin"]
    r = await client.post("/api/v1/auth/logout")
    assert r.status_code == 403


async def test_cookieless_app_requests_need_no_origin(app_client: httpx.AsyncClient) -> None:
    r = await app_client.post(LOGIN, json={"login": "nobody", "password": PASSWORD})
    assert r.status_code == 401


async def test_cors_preflight(client: httpx.AsyncClient) -> None:
    r = await client.options(
        LOGIN,
        headers={
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:8081"
    assert r.headers["access-control-allow-credentials"] == "true"


async def test_large_bodies_are_rejected(client: httpx.AsyncClient) -> None:
    r = await client.post(
        LOGIN, content=b"x" * 20_000, headers={"content-type": "application/json"}
    )
    assert r.status_code == 413

    async def chunks() -> AsyncIterator[bytes]:
        for _ in range(20):
            yield b"x" * 1024

    r = await client.post(LOGIN, content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413


async def test_bad_content_length_is_rejected(client: httpx.AsyncClient) -> None:
    r = await client.post(LOGIN, content=b"{}", headers={"content-length": "abc"})
    assert r.status_code == 413


async def test_login_rate_limit(app: FastAPI) -> None:
    def client_from(ip: str) -> httpx.AsyncClient:
        transport = httpx.ASGITransport(app=app, client=(ip, 1234))
        return httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async with client_from("203.0.113.1") as attacker, client_from("198.51.100.7") as owner:
        for _ in range(10):
            r = await attacker.post(LOGIN, json={"login": "victim", "password": "wrong password"})
            assert r.status_code == 401
        r = await attacker.post(LOGIN, json={"login": "VICTIM", "password": "wrong password"})
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "rate_limited"
        assert 1 <= int(r.headers["retry-after"]) <= 900
        # The attacker's failures do not lock the account owner out.
        r = await owner.post(LOGIN, json={"login": "victim", "password": "wrong password"})
        assert r.status_code == 401


async def test_one_address_can_sign_in_many_people(
    app: FastAPI, client: httpx.AsyncClient, mailer: MemoryMailer, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A school or office shares one address. Successful sign-ins never use up its allowance;
    only failed ones count, and too many of them block the address (not the accounts)."""
    monkeypatch.setattr(account_routes, "LOGIN_FAILURES_PER_IP", Limit("login-fail-ip", 3, 900))
    for name in ("ana", "ben"):
        await sign_up(client, mailer, name, f"{name}@example.com")
    r = await client.post(
        "/api/v1/auth/register",
        json={**AGREE, "username": "dan", "email": "dan@example.com", "password": PASSWORD},
    )
    assert r.status_code == 202  # dan never confirms his address

    def client_from(ip: str) -> httpx.AsyncClient:
        transport = httpx.ASGITransport(app=app, client=(ip, 1234))
        return httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async def sign_in(http: httpx.AsyncClient, name: str, password: str = PASSWORD) -> int:
        body = {"login": name, "password": password, "transport": "bearer"}
        return (await http.post(LOGIN, json=body)).status_code

    async with client_from("192.0.2.10") as classroom, client_from("192.0.2.99") as home:
        for _ in range(5):  # more sign-ins than the failure allowance: all fine
            assert {await sign_in(classroom, "ana"), await sign_in(classroom, "ben")} == {200}
        # Refusals other than a wrong password are not failed guesses.
        assert [await sign_in(classroom, "dan") for _ in range(4)] == [403] * 4
        assert await sign_in(classroom, "ana") == 200
        for name in ("ana", "ben", "cara"):  # three wrong passwords use the allowance up
            assert await sign_in(classroom, name, "wrong password") == 401
        r = await classroom.post(
            LOGIN, json={"login": "ana", "password": PASSWORD, "transport": "bearer"}
        )
        assert r.status_code == 429
        assert r.json()["error"]["code"] == "rate_limited"
        assert await sign_in(home, "ana") == 200  # another address is not affected


async def test_parallel_guesses_cannot_slip_under_the_failure_limit(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Every attempt is counted as a failure before the password is checked, so a burst of
    guesses sent at once gets no more tries than the limit allows."""
    monkeypatch.setattr(account_routes, "LOGIN_FAILURES_PER_IP", Limit("login-fail-ip", 3, 900))
    transport = httpx.ASGITransport(app=app, client=("203.0.113.9", 1234))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as attacker:
        replies = await asyncio.gather(
            *(
                attacker.post(LOGIN, json={"login": f"user{i}", "password": "guess guess"})
                for i in range(12)
            )
        )
    codes = sorted(r.status_code for r in replies)
    assert codes == [401] * 3 + [429] * 9


async def test_memory_rate_limiter_windows_and_capacity() -> None:
    limiter = MemoryRateLimiter(max_keys=2)
    limit = Limit("t", 2, 3600)
    assert await limiter.hit(limit, "a") == 0
    assert await limiter.hit(limit, "a") == 0
    assert await limiter.hit(limit, "a") > 0
    await limiter.hit(limit, "b")
    await limiter.hit(limit, "c")  # evicts "a", the least recently used
    assert await limiter.hit(limit, "a") == 0


async def test_unknown_routes_use_the_error_format(client: httpx.AsyncClient) -> None:
    r = await client.get("/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    r = await client.get(LOGIN)
    assert r.status_code == 405


async def test_unexpected_errors_are_hidden(app: FastAPI) -> None:
    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret detail")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        r = await c.get("/boom")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert "secret" not in r.text


async def test_readiness(client: httpx.AsyncClient) -> None:
    r = await client.get("/health/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


async def test_readiness_reports_a_broken_database(tmp_path: Path) -> None:
    broken = Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'missing' / 'x.db'}",
        mail_backend="memory",
    )
    app = create_app(broken)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
            r = await c.get("/health/ready")
    assert r.status_code == 503
    assert r.json() == {"status": "failing", "database": "failing"}


def test_production_refuses_unsafe_settings() -> None:
    with pytest.raises(ValidationError) as info:
        Settings(environment="production")
    message = str(info.value)
    for problem in ("SQLite", "redis_url", "smtp", "https", "privacy policy and terms need"):
        assert problem in message


def test_production_accepts_safe_settings() -> None:
    s = Settings.model_validate(
        {
            "environment": "production",
            "database_url": "mysql+asyncmy://u:p@db/baghchal",
            "redis_url": "redis://cache:6379/0",
            "mail_backend": "smtp",
            "smtp_host": "smtp.example.com",
            "public_base_url": "https://baghchal.example",
            "allowed_origins": ("https://baghchal.example",),
            **dict.fromkeys(LEGAL_DETAILS, "Set"),
        }
    )
    assert s.session_cookie_name == "__Host-session"
    with pytest.raises(ValidationError, match="need grievance_email"):
        s.model_validate({**s.model_dump(), "grievance_email": " "})
