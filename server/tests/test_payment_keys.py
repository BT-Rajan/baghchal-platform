"""The payments page: Razorpay keys entered by an admin, behind a code sent by email."""

import dataclasses
import re

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer
from baghchal_server.payments import keys as payment_keys
from baghchal_server.payments.models import PaymentKeys

from .conftest import ORIGIN, PASSWORD, Clock, Player, PlayerFactory
from .test_billing import make_admin
from .test_payments import FakeGateway

KEYS = "/api/v1/admin/payment-keys"
NEW = {
    "key_id": "rzp_live_abcdef123",
    "key_secret": "live-secret-1",
    "webhook_secret": "hook-secret-1",
}


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(
        environment="test",
        database_url=database_url,
        database_pool_size=2,
        mail_backend="memory",
        allowed_origins=(ORIGIN,),
        game_sweeper=False,
        computer_workers=0,
        fair_play_checks=False,
        housekeeping=False,
        secrets_key="a-long-random-secrets-key",
    )


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


async def _code(admin: Player, mailer: MemoryMailer) -> str:
    assert (await admin.http.post("/api/v1/admin/code")).status_code == 202
    mail = mailer.outbox[-1]
    assert mail.to == f"{admin.username}@example.com"
    found = re.search(r"code: (\d{6})", mail.subject)
    assert found is not None
    return found.group(1)


async def _checked(app: FastAPI, players: PlayerFactory, mailer: MemoryMailer) -> Player:
    boss = await players("boss")
    await make_admin(app, boss)
    r = await boss.http.post("/api/v1/admin/code/check", json={"code": await _code(boss, mailer)})
    assert r.status_code == 200, r.text
    return boss


async def test_the_page_needs_an_admin_and_a_code(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, clock: Clock
) -> None:
    alice, boss = await players("alice"), await players("boss")
    for call in (alice.http.get(KEYS), alice.http.post("/api/v1/admin/code")):
        r = await call
        assert (r.status_code, r.json()["error"]["code"]) == (403, "not_an_admin")
    await make_admin(app, boss)
    r = await boss.http.get(KEYS)
    assert (r.status_code, r.json()["error"]["code"]) == (403, "admin_code_needed")
    assert (await boss.http.put(KEYS, json=NEW)).status_code == 403

    code = await _code(boss, mailer)
    assert "works for 10 minutes" in mailer.outbox[-1].body
    wrong = "000000" if code != "000000" else "111111"
    r = await boss.http.post("/api/v1/admin/code/check", json={"code": wrong})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "wrong_code")
    r = await boss.http.post("/api/v1/admin/code/check", json={"code": "12345"})
    assert r.status_code == 422

    # The code works only on the device that asked for it.
    other = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
    async with other:
        r = await other.post(
            "/api/v1/auth/login",
            json={"login": "boss", "password": PASSWORD, "transport": "bearer"},
        )
        other.headers["authorization"] = f"Bearer {r.json()['token']}"
        r = await other.post("/api/v1/admin/code/check", json={"code": code})
        assert (r.status_code, r.json()["error"]["code"]) == (400, "wrong_code")

    r = await boss.http.post("/api/v1/admin/code/check", json={"code": code})
    assert r.status_code == 200
    page = (await boss.http.get(KEYS)).json()
    assert page == {
        "on": False,
        "key_id": None,
        "updated_at": None,
        "updated_by": None,
        "can_store": True,
        "webhook_url": "http://localhost:8081/api/v1/payments/webhook",
    }
    # A code works once; the page stays open 15 minutes.
    r = await boss.http.post("/api/v1/admin/code/check", json={"code": code})
    assert r.status_code == 400
    clock.advance(minutes=16)
    assert (await boss.http.get(KEYS)).json()["error"]["code"] == "admin_code_needed"

    # An older code stops working once a new one is sent; expired codes do not work.
    first = await _code(boss, mailer)
    await _code(boss, mailer)
    r = await boss.http.post("/api/v1/admin/code/check", json={"code": first})
    assert r.status_code == 400


async def test_guessing_is_limited(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, clock: Clock
) -> None:
    boss = await players("boss")
    await make_admin(app, boss)
    code = await _code(boss, mailer)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        await boss.http.post("/api/v1/admin/code/check", json={"code": wrong})
    r = await boss.http.post("/api/v1/admin/code/check", json={"code": code})
    assert r.status_code == 429
    clock.advance(minutes=11)
    for _ in range(4):
        await _code(boss, mailer)
    assert (await boss.http.post("/api/v1/admin/code")).status_code == 429


async def test_setting_and_removing_the_keys(
    app: FastAPI,
    players: PlayerFactory,
    mailer: MemoryMailer,
    gateway: FakeGateway,
) -> None:
    alice = await players("alice")
    boss = await _checked(app, players, mailer)
    r = await alice.http.post("/api/v1/payments/checkout", json={"plan": "pro", "period": "month"})
    assert (r.status_code, r.json()["error"]["code"]) == (503, "payments_off")

    r = await boss.http.put(KEYS, json=NEW)
    assert r.status_code == 200, r.text
    page = r.json()
    assert (page["on"], page["key_id"], page["updated_by"]) == (True, NEW["key_id"], "boss")
    assert "live-secret" not in r.text
    assert "hook-secret" not in r.text
    told = mailer.outbox[-1]
    assert (told.to, told.subject) == ("boss@example.com", "ClawPlay payment keys changed")
    assert "boss set the Razorpay live keys (rzp_live_abcdef123)" in told.body
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        stored = await db.get(PaymentKeys, 1)
        assert stored is not None
        assert "live-secret" not in stored.key_secret  # encrypted
        assert (await payment_keys.load(db, state.settings)) == payment_keys.Keys(
            NEW["key_id"], "live-secret-1", "hook-secret-1"
        )

    # Payments are taken at once, no restart.
    assert (await alice.http.get("/api/v1/me/payments")).json()["enabled"] is True
    r = await alice.http.post("/api/v1/payments/checkout", json={"plan": "pro", "period": "month"})
    assert r.status_code == 201

    for bad in (
        {**NEW, "key_id": "sk_live_abc"},
        {**NEW, "key_secret": "short"},
        {k: v for k, v in NEW.items() if k != "webhook_secret"},
    ):
        assert (await boss.http.put(KEYS, json=bad)).status_code == 422

    r = await boss.http.delete(KEYS)
    assert (r.status_code, r.json()["on"], r.json()["key_id"]) == (200, False, None)
    assert "removed the Razorpay keys" in mailer.outbox[-1].body
    assert (await alice.http.get("/api/v1/me/payments")).json()["enabled"] is False


async def test_keys_need_the_secrets_key(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    boss = await _checked(app, players, mailer)
    await boss.http.put(KEYS, json=NEW)
    state: AppState = app.state.ctx
    # The server's secrets key changed: the stored keys cannot be read, so payments are off.
    changed = state.settings.model_copy(update={"secrets_key": SecretStr("another-secrets-key")})
    app.state.ctx = dataclasses.replace(state, settings=changed)
    assert (await boss.http.get(KEYS)).json()["on"] is False
    # And without one, keys cannot be stored at all.
    unset = state.settings.model_copy(update={"secrets_key": SecretStr("")})
    app.state.ctx = dataclasses.replace(state, settings=unset)
    assert (await boss.http.get(KEYS)).json()["can_store"] is False
    r = await boss.http.put(KEYS, json=NEW)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "secrets_key_missing")
    app.state.ctx = state
