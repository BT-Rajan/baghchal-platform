"""Buying Plus or Pro with Razorpay: orders, the browser's confirmation, and the webhook."""

import hashlib
import hmac
import json
from datetime import timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select, update

from baghchal_server.app import create_app
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer
from baghchal_server.payments.gateway import (
    GatewayError,
    RazorpayGateway,
    payment_signed,
    webhook_signed,
)
from baghchal_server.payments.models import Payment

from .conftest import ORIGIN, Clock, Player, PlayerFactory

KEY_SECRET = "test-key-secret"
WEBHOOK_SECRET = "test-webhook-secret"


class FakeGateway:
    key_id = "rzp_test_fake"

    def __init__(self) -> None:
        self.orders: list[dict[str, Any]] = []
        self.down = False

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict[str, str]) -> str:
        if self.down:
            raise GatewayError("unreachable")
        self.orders.append({"amount": amount_paise, "receipt": receipt, "notes": notes})
        return f"order_{len(self.orders)}"

    async def close(self) -> None:
        pass


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
        razorpay_key_id=FakeGateway.key_id,
        razorpay_key_secret=KEY_SECRET,
        razorpay_webhook_secret=WEBHOOK_SECRET,
    )


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


def _sign(message: str | bytes, secret: str) -> str:
    raw = message.encode() if isinstance(message, str) else message
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


async def _buy(player: Player, plan: str = "plus", period: str = "month") -> dict[str, Any]:
    r = await player.http.post("/api/v1/payments/checkout", json={"plan": plan, "period": period})
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


async def _verify(player: Player, order_id: str, payment_id: str = "pay_1") -> httpx.Response:
    return await player.http.post(
        "/api/v1/payments/verify",
        json={
            "order_id": order_id,
            "payment_id": payment_id,
            "signature": _sign(f"{order_id}|{payment_id}", KEY_SECRET),
        },
    )


async def _webhook(app: FastAPI, event: dict[str, Any], secret: str = WEBHOOK_SECRET) -> Any:
    body = json.dumps(event).encode()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as razorpay:
        r = await razorpay.post(
            "/api/v1/payments/webhook",
            content=body,
            headers={"X-Razorpay-Signature": _sign(body, secret)},
        )
    return r


def _event(name: str, order_id: str, payment_id: str = "pay_9") -> dict[str, Any]:
    return {
        "event": name,
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id}}},
    }


async def test_buy_a_month_of_plus(
    players: PlayerFactory, gateway: FakeGateway, mailer: MemoryMailer, clock: Clock
) -> None:
    alice = await players("alice")
    order = await _buy(alice)
    assert order == {
        "key_id": "rzp_test_fake",
        "order_id": "order_1",
        "amount_paise": 14900,
        "currency": "INR",
        "name": "ClawPlay",
        "description": "ClawPlay Plus for a month",
        "email": "alice@example.com",
        "username": "alice",
    }
    assert gateway.orders[0]["notes"] == {
        "user_id": alice.id,
        "plan": "plus",
        "period": "month",
    }
    # Nothing to show for an order not paid yet.
    assert (await alice.http.get("/api/v1/me/payments")).json() == {
        "enabled": True,
        "payments": [],
    }

    r = await _verify(alice, "order_1")
    assert r.status_code == 200, r.text
    paid = r.json()
    until = (clock() + timedelta(days=30)).isoformat().replace("+00:00", "Z")
    assert (paid["status"], paid["plan"], paid["period"], paid["until"]) == (
        "paid",
        "plus",
        "month",
        until,
    )
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert (mine["plan"], mine["plan_until"]) == ("plus", until)
    assert mine["grants"][0]["paid"] is True
    receipt = mailer.outbox[-1]
    assert receipt.subject == "Your ClawPlay Plus receipt"
    assert "You paid ₹149 for ClawPlay Plus for a month" in receipt.body
    assert "Payment: pay_1" in receipt.body

    # Confirming twice gives nothing twice.
    sent = len(mailer.outbox)
    assert (await _verify(alice, "order_1")).json()["until"] == until
    assert len(mailer.outbox) == sent
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert [(p["status"], p["amount_paise"]) for p in listed] == [("paid", 14900)]


async def test_buying_again_adds_on(players: PlayerFactory, clock: Clock) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice))["order_id"], "pay_1")
    clock.advance(days=10)
    r = await _verify(alice, (await _buy(alice, period="year"))["order_id"], "pay_2")
    until = clock() + timedelta(days=20 + 365)
    assert r.json()["until"] == until.isoformat().replace("+00:00", "Z")
    assert r.json()["amount_paise"] == 149000

    # Pro runs from now, alongside.
    r = await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_3")
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert (mine["plan"], mine["plan_until"]) == ("pro", r.json()["until"])


async def test_what_cannot_be_confirmed(players: PlayerFactory, gateway: FakeGateway) -> None:
    alice, bob = await players("alice"), await players("bob")
    order = (await _buy(alice))["order_id"]
    r = await alice.http.post(
        "/api/v1/payments/verify",
        json={"order_id": order, "payment_id": "pay_1", "signature": "0" * 64},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (400, "bad_signature")
    r = await _verify(bob, order)  # a genuine signature, for someone else's order
    assert (r.status_code, r.json()["error"]["code"]) == (404, "payment_not_found")
    r = await _verify(alice, "order_unknown")
    assert r.status_code == 404
    r = await alice.http.post("/api/v1/payments/checkout", json={"plan": "free", "period": "month"})
    assert r.status_code == 422

    gateway.down = True
    r = await alice.http.post("/api/v1/payments/checkout", json={"plan": "pro", "period": "year"})
    assert (r.status_code, r.json()["error"]["code"]) == (502, "payment_provider_error")


async def test_the_webhook(app: FastAPI, players: PlayerFactory, mailer: MemoryMailer) -> None:
    alice = await players("alice")
    order = (await _buy(alice))["order_id"]

    r = await _webhook(app, _event("payment.captured", order), secret="wrong")
    assert r.status_code == 400
    assert (await _webhook(app, _event("payment.failed", order))).json() == {"status": "ok"}
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert [p["status"] for p in listed] == ["failed"]

    # A second try at the same order succeeds; the browser never came back, but the plan is given.
    assert (await _webhook(app, _event("order.paid", order))).json() == {"status": "ok"}
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "plus"
    assert mailer.outbox[-1].subject == "Your ClawPlay Plus receipt"
    sent = len(mailer.outbox)
    # Razorpay repeats itself, and a late failure changes nothing.
    await _webhook(app, _event("payment.captured", order))
    await _webhook(app, _event("payment.failed", order))
    assert len(mailer.outbox) == sent
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert [p["status"] for p in listed] == ["paid"]

    # Orders from elsewhere, other events, and events without a payment are ignored.
    ignored = {"status": "ignored"}
    assert (await _webhook(app, _event("payment.captured", "order_other"))).json() == ignored
    assert (await _webhook(app, {"event": "refund.created", "payload": {}})).json() == ignored
    assert (await _webhook(app, _event("payment.authorized", order))).json() == {"status": "ok"}


async def test_paid_after_the_account_was_deleted(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    order = (await _buy(alice))["order_id"]
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        await db.execute(update(Payment).where(Payment.order_id == order).values(user_id=None))
        await db.commit()
    assert (await _webhook(app, _event("payment.captured", order))).json() == {"status": "ok"}
    async with state.sessions() as db:
        payment = await db.scalar(select(Payment).where(Payment.order_id == order))
    assert payment is not None
    assert (payment.status, payment.grant_id) == ("paid", None)  # a record; nobody to give it to


def test_signatures() -> None:
    assert payment_signed("order_1", "pay_1", _sign("order_1|pay_1", "s"), "s")
    assert not payment_signed("order_1", "pay_2", _sign("order_1|pay_1", "s"), "s")
    assert webhook_signed(b"{}", _sign(b"{}", "w"), "w")
    assert not webhook_signed(b"{}", _sign(b"{}", ""), "")  # no secret set: never trusted


async def test_razorpay_orders() -> None:
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if json.loads(request.content)["amount"] == 1:
            return httpx.Response(400, json={"error": {"description": "too small"}})
        if json.loads(request.content)["amount"] == 2:
            raise httpx.ConnectError("down")
        return httpx.Response(200, json={"id": "order_X", "status": "created"})

    gateway = RazorpayGateway("rzp_test_k", "s3cret", transport=httpx.MockTransport(answer))
    try:
        order = await gateway.create_order(amount_paise=14900, receipt="r", notes={"a": "b"})
        assert order == "order_X"
        sent = seen[0]
        assert (sent.method, str(sent.url)) == ("POST", "https://api.razorpay.com/v1/orders")
        assert sent.headers["authorization"].startswith("Basic ")
        assert json.loads(sent.content) == {
            "amount": 14900,
            "currency": "INR",
            "receipt": "r",
            "notes": {"a": "b"},
        }
        with pytest.raises(GatewayError, match="Razorpay answered 400"):
            await gateway.create_order(amount_paise=1, receipt="r", notes={})
        with pytest.raises(GatewayError, match="down"):
            await gateway.create_order(amount_paise=2, receipt="r", notes={})
    finally:
        await gateway.close()


async def test_razorpay_is_used_when_configured(settings: Settings) -> None:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        state: AppState = app.state.ctx
        assert isinstance(state.gateway, RazorpayGateway)
        assert state.gateway.key_id == "rzp_test_fake"
