"""Buying Plus or Pro with Razorpay: orders, the browser's confirmation, and the webhook."""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select, update

from baghchal_server.accounts.models import User
from baghchal_server.billing import reminders
from baghchal_server.billing.models import Grant
from baghchal_server.billing.service import my_plan
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer
from baghchal_server.payments import keys as payment_keys
from baghchal_server.payments.gateway import (
    GatewayError,
    PaymentState,
    RazorpayGateway,
    payment_signed,
    webhook_signed,
)
from baghchal_server.payments.models import Payment, PaymentKeys

from .conftest import ORIGIN, Clock, Player, PlayerFactory
from .test_billing import give_plan

SECRETS_KEY = "test-secrets-key-for-the-database"
KEY_SECRET = "test-key-secret"
WEBHOOK_SECRET = "test-webhook-secret"


class FakeGateway:
    key_id = "rzp_test_fake00"

    def __init__(self) -> None:
        self.orders: list[dict[str, Any]] = []
        self.down = False
        self.capture_down = False
        self.payments: dict[str, PaymentState] = {}
        self.captured: list[tuple[str, int]] = []

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict[str, str]) -> str:
        if self.down:
            raise GatewayError("unreachable")
        self.orders.append({"amount": amount_paise, "receipt": receipt, "notes": notes})
        return f"order_{len(self.orders)}"

    async def payment(self, payment_id: str) -> PaymentState:
        """Paid for the latest order, unless a test says otherwise in ``payments``."""
        if self.down:
            raise GatewayError("unreachable")
        if payment_id in self.payments:
            return self.payments[payment_id]
        return PaymentState(f"order_{len(self.orders)}", self.orders[-1]["amount"], "captured")

    async def capture(self, payment_id: str, amount_paise: int) -> str:
        if self.capture_down:
            raise GatewayError("unreachable")
        self.captured.append((payment_id, amount_paise))
        return "captured"

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
        secrets_key=SECRETS_KEY,
    )


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


@pytest.fixture(autouse=True)
async def _keys(app: FastAPI) -> None:
    """The keys an admin entered on the payments page."""
    await store_keys(app)


async def store_keys(app: FastAPI, key_id: str = FakeGateway.key_id) -> None:
    state: AppState = app.state.ctx
    box = payment_keys._box(state.settings)
    assert box is not None
    async with state.sessions() as db:
        db.add(
            PaymentKeys(
                id=1,
                key_id=key_id,
                key_secret=box.encrypt(KEY_SECRET.encode()).decode(),
                webhook_secret=box.encrypt(WEBHOOK_SECRET.encode()).decode(),
                updated_at=state.clock(),
            )
        )
        await db.commit()


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
        "key_id": "rzp_test_fake00",
        "order_id": "order_1",
        "amount_paise": 14900,
        "currency": "INR",
        "name": "ClawPlay",
        "description": "ClawPlay Plus for 45 games or a month",
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
    assert "You paid ₹149 for ClawPlay Plus for 45 games or a month" in receipt.body
    assert f"for 45 games, until {(clock() + timedelta(days=30)).day}" in receipt.body
    assert mine["games_left"] == 45
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
    r = await _verify(alice, (await _buy(alice))["order_id"], "pay_2")
    until = clock() + timedelta(days=20 + 30)
    assert r.json()["until"] == until.isoformat().replace("+00:00", "Z")
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert (mine["plan_until"], mine["games_left"]) == (r.json()["until"], 90)
    r = await alice.http.post("/api/v1/payments/checkout", json={"plan": "plus", "period": "year"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "not_sold_for_a_year")
    pro = await _buy(alice, "pro", "year")
    assert pro["amount_paise"] == 299000


def _z(at: datetime) -> str:
    return at.isoformat().replace("+00:00", "Z")


async def _plan_then(app: FastAPI, player: Player) -> tuple[str, str | None]:
    """The plan and its end, long after the player's session has lapsed."""
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        mine = await my_plan(db, uuid.UUID(player.id), state.clock())
    return mine.plan, None if mine.plan_until is None else _z(mine.plan_until)


async def test_plus_bought_on_pro_waits_for_it(
    app: FastAPI, players: PlayerFactory, clock: Clock, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice, "pro", "year"))["order_id"], "pay_1")
    pro_ends = clock() + timedelta(days=365)
    clock.advance(days=5)
    r = (await _verify(alice, (await _buy(alice, "plus"))["order_id"], "pay_2")).json()
    # The Plus month is not spent underneath Pro: it starts when Pro ends.
    assert (r["starts"], r["until"]) == (_z(pro_ends), _z(pro_ends + timedelta(days=30)))
    assert f"from {pro_ends.day} {pro_ends:%b %Y}, after the plan time you already have" in (
        mailer.outbox[-1].body
    )
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert (mine["plan"], mine["plan_until"]) == ("pro", _z(pro_ends))
    assert [(g["plan"], g["starts_at"], g["active"]) for g in mine["waiting"]] == [
        ("plus", _z(pro_ends), False)
    ]
    # A second Plus month lines up after the first.
    clock.advance(minutes=1)
    r = (await _verify(alice, (await _buy(alice, "plus"))["order_id"], "pay_3")).json()
    assert r["until"] == _z(pro_ends + timedelta(days=60))

    clock.advance(days=360)  # Pro has ended; Plus runs for both months
    assert await _plan_then(app, alice) == ("plus", _z(pro_ends + timedelta(days=60)))


async def test_pro_bought_on_plus_moves_the_plus_time_left(
    app: FastAPI, players: PlayerFactory, clock: Clock, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice, "plus"))["order_id"], "pay_1")
    clock.advance(days=10)  # 20 days of Plus left
    pro = (await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_2")).json()
    pro_ends = clock() + timedelta(days=30)
    assert (pro["starts"], pro["until"]) == (_z(clock()), _z(pro_ends))
    plus_ends = pro_ends + timedelta(days=20)
    assert f"now follows it, until {plus_ends.day} {plus_ends:%b %Y}" in mailer.outbox[-1].body
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert [(p["plan"], p["starts"], p["until"]) for p in listed] == [
        ("pro", _z(clock()), _z(pro_ends)),
        ("plus", _z(pro_ends), _z(plus_ends)),
    ]
    clock.advance(days=30)
    assert await _plan_then(app, alice) == ("plus", _z(plus_ends))


async def test_nothing_to_buy_under_a_plan_held_for_good(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice = await players("alice")
    await give_plan(app, alice, "pro")
    for plan in ("plus", "pro"):
        r = await alice.http.post(
            "/api/v1/payments/checkout", json={"plan": plan, "period": "month"}
        )
        assert (r.status_code, r.json()["error"]["code"]) == (409, "plan_held_for_good")
    bob = await players("bob")
    await give_plan(app, bob, "plus")
    await _buy(bob, "pro")  # Pro is more than Plus for good


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


async def test_razorpay_is_used_with_the_stored_keys(app: FastAPI) -> None:
    state = payment_keys.Gateways()
    keys = payment_keys.Keys("rzp_test_abcdef", "s", "w")
    try:
        made = state.get(keys)
        assert isinstance(made, RazorpayGateway)
        assert made.key_id == "rzp_test_abcdef"
        assert state.get(keys) is made  # one per set of keys
        assert state.get(payment_keys.Keys("rzp_test_other1", "s", "w")) is not made
    finally:
        await state.close()


async def test_plus_lasts_45_games(app: FastAPI, players: PlayerFactory, clock: Clock) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice))["order_id"], "pay_1")
    clock.advance(minutes=1)
    second = await _verify(alice, (await _buy(alice))["order_id"], "pay_2")
    state: AppState = app.state.ctx
    async with state.sessions() as db:  # the first purchase is down to its last game
        await db.execute(update(Grant).where(Grant.reason.contains("pay_1")).values(games_left=1))
        await db.commit()

    async def play() -> None:
        game = (await alice.http.post("/api/v1/games/computer", json={"side": "goat"})).json()
        assert (await alice.http.post(f"/api/v1/games/{game['id']}/resign")).status_code == 200

    await play()  # the last game of the first: the second starts now, for its full 30 days
    clock.advance(minutes=1)
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    second_ends = clock() - timedelta(minutes=1) + timedelta(days=30)
    assert (mine["plan"], mine["games_left"], mine["plan_until"]) == ("plus", 45, _z(second_ends))
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert listed[0]["until"] == _z(second_ends) != second.json()["until"]
    await play()
    assert (await alice.http.get("/api/v1/me/plan")).json()["games_left"] == 44

    # Aborted games, and games played on Pro, are not counted.
    game = (await alice.http.post("/api/v1/games/computer", json={"side": "goat"})).json()
    await alice.http.post(f"/api/v1/games/{game['id']}/abort")
    assert (await alice.http.get("/api/v1/me/plan")).json()["games_left"] == 44
    await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_3")
    await play()
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert (mine["plan"], mine["games_left"]) == ("pro", None)
    assert [g["games_left"] for g in mine["waiting"]] == [44]


async def test_under_18s_cannot_buy_and_their_parent_is_told(
    app: FastAPI, players: PlayerFactory, gateway: FakeGateway, mailer: MemoryMailer, clock: Clock
) -> None:
    kid = await players("kid")
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        await db.execute(
            update(User)
            .where(User.id == uuid.UUID(kid.id))
            .values(adult_from=clock() + timedelta(days=300), parent_email="mum@example.com")
        )
        await db.commit()
    checkout = "/api/v1/payments/checkout"
    r = await kid.http.post(checkout, json={"plan": "plus", "period": "month"})
    assert (r.status_code, r.json()["error"]) == (
        403,
        {
            "code": "under_18",
            "message": "Players under 18 cannot buy plans. "
            "We have told your parent or guardian by email.",
        },
    )
    told = mailer.outbox[-1]
    assert (told.to, told.subject) == ("mum@example.com", "kid would like ClawPlay Plus")
    assert "₹149 for 45 games or a month" in told.body
    assert "nothing was charged" in told.body
    assert gateway.orders == []  # no order made

    sent = len(mailer.outbox)
    await kid.http.post(checkout, json={"plan": "plus", "period": "month"})  # once a day
    assert len(mailer.outbox) == sent
    await kid.http.post(checkout, json={"plan": "pro", "period": "year"})
    assert mailer.outbox[-1].subject == "kid would like ClawPlay Pro"
    assert "₹299 for a month or a year" in mailer.outbox[-1].body

    # Without a parent's address on record, nobody is told.
    async with state.sessions() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(kid.id)).values(parent_email=None))
        await db.commit()
    clock.advance(days=2)
    r = await kid.http.post(checkout, json={"plan": "plus", "period": "month"})
    assert r.json()["error"]["message"] == "Players under 18 cannot buy plans."


def _refund(refund_id: str, payment_id: str, amount: int) -> dict[str, Any]:
    return {
        "event": "refund.processed",
        "payload": {
            "refund": {"entity": {"id": refund_id, "payment_id": payment_id, "amount": amount}}
        },
    }


async def test_a_refund_ends_the_plan_time_it_bought(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer, clock: Clock
) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_pro")
    clock.advance(minutes=1)
    plus = (await _verify(alice, (await _buy(alice, "plus"))["order_id"], "pay_plus")).json()
    pro_ends = clock() - timedelta(minutes=1) + timedelta(days=30)
    assert plus["starts"] == _z(pro_ends)  # waiting for Pro

    # Part of Pro back: recorded, the plan stays; Razorpay saying so twice counts once.
    assert (await _webhook(app, _refund("rfnd_1", "pay_pro", 10000))).json() == {"status": "ok"}
    assert "We have refunded ₹100 of your payment pay_pro" in mailer.outbox[-1].body
    sent = len(mailer.outbox)
    await _webhook(app, _refund("rfnd_1", "pay_pro", 10000))
    assert len(mailer.outbox) == sent
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "pro"

    # The rest: Pro ends now, and the Plus waiting behind it starts.
    clock.advance(minutes=1)
    await _webhook(app, _refund("rfnd_2", "pay_pro", 19900))
    assert "ClawPlay Pro for a month from that payment has ended" in mailer.outbox[-1].body
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert (mine["plan"], mine["plan_until"]) == ("plus", _z(clock() + timedelta(days=30)))
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert [(p["plan"], p["status"]) for p in listed] == [("plus", "paid"), ("pro", "refunded")]
    # Later refunds on it change nothing more.
    await _webhook(app, _refund("rfnd_3", "pay_pro", 1))
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "plus"

    # Payments from elsewhere, and refunds without what is needed, are ignored.
    ignored = {"status": "ignored"}
    assert (await _webhook(app, _refund("rfnd_9", "pay_other", 100))).json() == ignored
    bad = {"event": "refund.processed", "payload": {"refund": {"entity": {"id": "rfnd_8"}}}}
    assert (await _webhook(app, bad)).json() == ignored


async def test_a_lost_dispute_ends_the_plan_time(
    app: FastAPI, players: PlayerFactory, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice))["order_id"], "pay_1")
    lost = {
        "event": "payment.dispute.lost",
        "payload": {"dispute": {"entity": {"id": "disp_1", "payment_id": "pay_1"}}},
    }
    assert (await _webhook(app, lost)).json() == {"status": "ok"}
    assert mailer.outbox[-1].subject == "Your ClawPlay payment was reversed"
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "free"
    listed = (await alice.http.get("/api/v1/me/payments")).json()["payments"]
    assert [p["status"] for p in listed] == ["reversed"]
    sent = len(mailer.outbox)
    await _webhook(app, lost)  # again: nothing more
    assert len(mailer.outbox) == sent
    no_payment = {"event": "payment.dispute.lost", "payload": {"dispute": {"entity": {}}}}
    assert (await _webhook(app, no_payment)).json() == {"status": "ignored"}


async def test_money_back_after_the_account_was_deleted(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice = await players("alice")
    order = (await _buy(alice))["order_id"]
    await _verify(alice, order, "pay_1")
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        await db.execute(update(Payment).where(Payment.order_id == order).values(user_id=None))
        await db.commit()
    assert (await _webhook(app, _refund("rfnd_1", "pay_1", 100))).json() == {"status": "ok"}
    assert (await _webhook(app, _refund("rfnd_2", "pay_1", 14800))).json() == {"status": "ok"}
    async with state.sessions() as db:
        payment = await db.scalar(select(Payment).where(Payment.order_id == order))
        assert payment is not None
        assert payment.status == "refunded"
    # And a dispute lost on a payment whose plan time is gone with the account.
    second = (await _buy(alice))["order_id"]
    await _verify(alice, second, "pay_2")
    async with state.sessions() as db:
        await db.execute(
            update(Payment).where(Payment.order_id == second).values(user_id=None, grant_id=None)
        )
        await db.commit()
    lost = {
        "event": "payment.dispute.lost",
        "payload": {"dispute": {"entity": {"payment_id": "pay_2"}}},
    }
    assert (await _webhook(app, lost)).json() == {"status": "ok"}


async def test_the_money_is_checked_before_the_plan_is_given(
    app: FastAPI, players: PlayerFactory, gateway: FakeGateway
) -> None:
    alice = await players("alice")
    order = (await _buy(alice))["order_id"]

    # Razorpay says the order or the amount is not this one's: refused.
    gateway.payments["pay_1"] = PaymentState(order, 100, "captured")
    r = await _verify(alice, order, "pay_1")
    assert (r.status_code, r.json()["error"]["code"]) == (400, "payment_mismatch")
    gateway.payments["pay_1"] = PaymentState("order_other", 14900, "captured")
    assert (await _verify(alice, order, "pay_1")).status_code == 400
    # Not yet captured, nor authorised: refused, the webhook will give it.
    gateway.payments["pay_1"] = PaymentState(order, 14900, "created")
    r = await _verify(alice, order, "pay_1")
    assert (r.status_code, r.json()["error"]["code"]) == (402, "payment_not_captured")
    gateway.down = True
    r = await _verify(alice, order, "pay_1")
    assert (r.status_code, r.json()["error"]["code"]) == (502, "payment_provider_error")
    gateway.down = False
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "free"

    # Authorised only (an account set to capture by hand): captured now, then given.
    gateway.payments["pay_1"] = PaymentState(order, 14900, "authorized")
    r = await _verify(alice, order, "pay_1")
    assert r.status_code == 200, r.text
    assert gateway.captured == [("pay_1", 14900)]
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "plus"
    # Confirming again asks Razorpay nothing.
    gateway.down = True
    assert (await _verify(alice, order, "pay_1")).status_code == 200


async def test_a_held_payment_is_captured_from_the_webhook(
    app: FastAPI, players: PlayerFactory, gateway: FakeGateway
) -> None:
    alice = await players("alice")
    order = (await _buy(alice, "pro"))["order_id"]
    held = _event("payment.authorized", order, "pay_7")
    assert (await _webhook(app, held)).json() == {"status": "ok"}
    assert gateway.captured == [("pay_7", 29900)]
    gateway.capture_down = True  # Razorpay retries its webhook
    assert (await _webhook(app, held)).json() == {"status": "ok"}
    # Other events about a payment are taken and left alone.
    assert (await _webhook(app, _event("payment.pending", order, "pay_7"))).json() == {
        "status": "ok"
    }
    other = _event("payment.authorized", "order_other", "pay_8")
    assert (await _webhook(app, other)).json() == {"status": "ignored"}


async def test_razorpay_payments_and_captures() -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/capture"):
            assert json.loads(request.content) == {"amount": 14900, "currency": "INR"}
            return httpx.Response(200, json={"id": "pay_A", "status": "captured"})
        if request.url.path.endswith("/pay_B"):
            return httpx.Response(404, json={"error": {"description": "no such payment"}})
        return httpx.Response(
            200,
            json={"id": "pay_A", "order_id": "order_X", "amount": 14900, "status": "authorized"},
        )

    gateway = RazorpayGateway("rzp_test_k", "s3cret", transport=httpx.MockTransport(answer))
    try:
        assert await gateway.payment("pay_A") == PaymentState("order_X", 14900, "authorized")
        assert await gateway.capture("pay_A", 14900) == "captured"
        with pytest.raises(GatewayError, match="Razorpay answered 404"):
            await gateway.payment("pay_B")
        with pytest.raises(GatewayError, match="not a Razorpay payment id"):
            await gateway.payment("../orders")
    finally:
        await gateway.close()

    def odd(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/pay_C"):
            raise httpx.ConnectError("down")
        return httpx.Response(200, json={"id": "pay_D"})

    gateway = RazorpayGateway("rzp_test_k", "s3cret", transport=httpx.MockTransport(odd))
    try:
        assert await gateway.payment("pay_D") == PaymentState(None, 0, "")
        with pytest.raises(GatewayError, match="down"):
            await gateway.payment("pay_C")
    finally:
        await gateway.close()


async def _reminders(app: FastAPI) -> list[Any]:
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        return await reminders.due(db, state.settings, state.clock())


async def test_a_reminder_before_the_plan_runs_out(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    start = clock()
    await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_1")
    clock.advance(minutes=1)
    await _verify(alice, (await _buy(alice, "plus"))["order_id"], "pay_2")  # waits for Pro
    await give_plan(app, bob, "pro")  # for good: nothing to remind

    clock.advance(days=28)  # Pro ends in 2 days, but Plus follows: no reminder yet
    assert await _reminders(app) == []
    clock.advance(days=28)  # Plus ends in 4 days
    assert await _reminders(app) == []
    clock.advance(days=1, hours=12)
    (mail,) = await _reminders(app)
    plus_ends = start + timedelta(days=60)
    assert (mail.to, mail.subject) == ("alice@example.com", "Your ClawPlay Plus ends soon")
    assert f"ends on {plus_ends.day} {plus_ends:%b %Y} (or sooner, once its 45 games" in mail.body
    assert "nothing more will be charged" in mail.body
    assert "http://localhost:8081/plans" in mail.body
    assert await _reminders(app) == []  # once


async def test_no_reminder_for_a_deleted_account_or_a_given_plan_without_games(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, carol = await players("alice"), await players("carol")
    await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_1")
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(alice.id)).values(is_active=False))
        await db.commit()
    async with state.sessions() as db:
        db.add(
            Grant(
                user_id=uuid.UUID(carol.id),
                plan="plus",
                starts_at=clock(),
                ends_at=clock() + timedelta(days=2),
                reason="gift",
                created_at=clock(),
            )
        )
        await db.commit()
    (mail,) = await _reminders(app)  # carol only; her gift has no game limit
    assert mail.to == "carol@example.com"
    assert "games" not in mail.body.split("Plans never")[0]


async def test_two_servers_send_a_reminder_once(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice))["order_id"], "pay_1")
    clock.advance(days=28)
    state: AppState = app.state.ctx
    async with state.sessions() as db:
        looked = db.scalar

        async def meanwhile(*args: Any, **kwargs: Any) -> Any:
            async with state.sessions() as other:  # the other server claims it first
                await other.execute(update(Grant).values(reminded_at=clock()))
                await other.commit()
            return await looked(*args, **kwargs)

        db.scalar = meanwhile  # type: ignore[method-assign]
        assert await reminders.due(db, state.settings, clock()) == []


async def test_refunded_and_reversed_payments_are_final(
    app: FastAPI, players: PlayerFactory, gateway: FakeGateway
) -> None:
    alice = await players("alice")
    order = (await _buy(alice, "pro"))["order_id"]
    await _verify(alice, order, "pay_1")
    lost = {
        "event": "payment.dispute.lost",
        "payload": {"dispute": {"entity": {"payment_id": "pay_1"}}},
    }
    await _webhook(app, lost)
    # Confirming it again, or a late webhook, gives nothing back.
    r = await _verify(alice, order, "pay_1")
    assert (r.status_code, r.json()["status"]) == (200, "reversed")
    await _webhook(app, _event("order.paid", order, "pay_1"))
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "free"

    order = (await _buy(alice))["order_id"]
    await _verify(alice, order, "pay_2")
    await _webhook(app, _refund("rfnd_1", "pay_2", 14900))
    await _webhook(app, _event("payment.captured", order, "pay_2"))
    assert (await alice.http.get("/api/v1/me/plan")).json()["plan"] == "free"
    # A second payment on a paid order is not captured: Razorpay hands it back.
    gateway.captured.clear()
    await _webhook(app, _event("payment.authorized", order, "pay_3"))
    assert gateway.captured == []


async def test_the_browser_and_the_webhook_at_once_give_one_plan(
    app: FastAPI, players: PlayerFactory, gateway: FakeGateway, mailer: MemoryMailer
) -> None:
    alice = await players("alice")
    order = (await _buy(alice, "pro"))["order_id"]
    asked = gateway.payment

    async def webhook_meanwhile(payment_id: str) -> PaymentState:
        await _webhook(app, _event("payment.captured", order, payment_id))  # lands first
        return await asked(payment_id)

    gateway.payment = webhook_meanwhile  # type: ignore[method-assign]
    sent = len(mailer.outbox)
    r = await _verify(alice, order, "pay_1")
    assert (r.status_code, r.json()["status"]) == (200, "paid")
    mine = (await alice.http.get("/api/v1/me/plan")).json()
    assert len(mine["grants"]) + len(mine["waiting"]) == 1
    assert len(mailer.outbox) == sent + 1  # one receipt


async def test_a_moved_plan_is_reminded_again(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice = await players("alice")
    await _verify(alice, (await _buy(alice))["order_id"], "pay_1")
    clock.advance(days=28)
    assert len(await _reminders(app)) == 1
    await _verify(alice, (await _buy(alice, "pro"))["order_id"], "pay_2")  # Plus moves after
    clock.advance(days=30)
    (mail,) = await _reminders(app)
    assert mail.subject == "Your ClawPlay Plus ends soon"
