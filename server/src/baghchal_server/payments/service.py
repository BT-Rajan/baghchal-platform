"""Buying a plan: Plus for 45 games or a month, Pro for a month or a year.

A paid period is an ordinary grant (see ``billing``), so everything that checks features
just works. Bought time is lined up with the rest (``billing.service.lay_out``): buying again
adds on, Plus bought while Pro runs starts when Pro ends, and Pro bought on Plus moves the Plus
time left to after it. Each order is fulfilled once, whether the browser or the webhook says so
first.
"""

import uuid
from datetime import datetime, timedelta
from typing import Final

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing.models import Grant
from baghchal_server.billing.plans import GAMES, NAMES, PRICES, RANK, Plan
from baghchal_server.billing.service import entitlements, lay_out
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.mail import Mail
from baghchal_server.payments.gateway import Gateway, GatewayError
from baghchal_server.payments.models import Payment, Refund
from baghchal_server.payments.schemas import (
    CheckoutIn,
    CheckoutOut,
    PaymentOut,
    PaymentStatus,
    Period,
)

log = structlog.get_logger()

LENGTH: Final = {Period.MONTH: timedelta(days=30), Period.YEAR: timedelta(days=365)}
FOR: Final = {Period.MONTH: "a month", Period.YEAR: "a year"}
LISTED: Final = 50


def price(plan: Plan, period: Period) -> int | None:
    """None: the plan is not sold for that long."""
    found = PRICES[plan]
    return found.monthly_paise if period == Period.MONTH else found.yearly_paise


def rupees(paise: int) -> str:
    return f"₹{paise // 100:,}" if paise % 100 == 0 else f"₹{paise / 100:,.2f}"


def under_18(user: User, now: datetime) -> bool:
    """Players under 18 cannot buy (a minor's contract is void): their parent is asked."""
    return user.adult_from is not None and user.adult_from > now


def parent_mail(settings: Settings, user: User, plan: Plan) -> Mail | None:
    """The email telling a player's parent that they wanted to buy a plan (None: no address)."""
    if user.parent_email is None:
        return None
    lasts = f"{GAMES[plan]} games or a month" if GAMES[plan] is not None else "a month or a year"
    cost = rupees(PRICES[plan].monthly_paise)
    help_ = (
        f"If you would like them to have it, write to {settings.contact_email} and we will help. "
        if settings.contact_email
        else ""
    )
    return Mail(
        user.parent_email,
        f"{user.username} would like ClawPlay {NAMES[plan]}",
        f"Hello,\n\n{user.username} tried to buy ClawPlay {NAMES[plan]} ({cost} for {lasts}). "
        "Players under 18 cannot buy plans themselves, so nothing was charged.\n\n"
        f"{help_}Otherwise there is nothing to do: free play stays free.\n\n"
        f"Plans: {settings.public_base_url}/plans",
    )


def _day(at: datetime) -> str:
    return f"{at.day} {at:%b %Y}"


def _what(payment: Payment) -> str:
    games = GAMES[Plan(payment.plan)]
    lasts = FOR[Period(payment.period)]
    if games is not None:
        lasts = f"{games} games or {lasts}"
    return f"ClawPlay {NAMES[Plan(payment.plan)]} for {lasts}"


async def checkout(
    db: AsyncSession, gateway: Gateway, user: User, now: datetime, data: CheckoutIn
) -> CheckoutOut:
    """Create an order for the plan; the browser takes the payment with Razorpay Checkout."""
    plan = Plan(data.plan)
    held = await entitlements(db, user.id, now)
    if held.plan_until is None and RANK[held.plan] >= RANK[plan] and held.plan != Plan.FREE:
        raise AppError(
            409,
            "plan_held_for_good",
            f"You have ClawPlay {NAMES[held.plan]} for good, so there is nothing to buy.",
        )
    amount = price(plan, data.period)
    if amount is None:
        raise AppError(
            422, "not_sold_for_a_year", f"ClawPlay {NAMES[plan]} is sold a month at a time."
        )
    payment = Payment(
        id=uuid.uuid4(),
        user_id=user.id,
        plan=plan,
        period=data.period,
        amount_paise=amount,
        status=PaymentStatus.CREATED,
        created_at=now,
    )
    try:
        payment.order_id = await gateway.create_order(
            amount_paise=amount,
            receipt=str(payment.id),
            notes={"user_id": str(user.id), "plan": plan, "period": data.period},
        )
    except GatewayError as e:
        raise AppError(
            502, "payment_provider_error", "Payments are not available right now. Please try later."
        ) from e
    db.add(payment)
    await db.commit()
    return CheckoutOut(
        key_id=gateway.key_id,
        order_id=payment.order_id,
        amount_paise=amount,
        name="ClawPlay",
        description=_what(payment),
        email=user.email,
        username=user.username,
    )


OPEN: Final = (PaymentStatus.CREATED, PaymentStatus.FAILED)
"""Not paid yet: only these may become paid (refunded and reversed payments are final)."""


async def _locked(db: AsyncSession, order_id: str) -> Payment:
    payment = await db.scalar(
        select(Payment)
        .where(Payment.order_id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)  # as stored now, not as read earlier
    )
    if payment is None:
        raise AppError(404, "payment_not_found", "No such payment.")
    return payment


async def _claim(
    db: AsyncSession, payment: Payment, before: tuple[str, ...], **values: object
) -> bool:
    """Move a payment on from one of ``before``, if nobody else did first (two requests at
    once, or a database without row locks): whether this one did."""
    done = await db.execute(
        update(Payment).where(Payment.id == payment.id, Payment.status.in_(before)).values(**values)
    )
    if done.rowcount != 1:  # type: ignore[attr-defined]
        await db.commit()
        await db.refresh(payment)
        return False
    for key, value in values.items():
        setattr(payment, key, value)
    return True


async def captured(gateway: Gateway, payment: Payment, payment_id: str) -> None:
    """Make sure the money is ours before the plan is given: Razorpay must say the payment is
    for this order and amount, and captured (an authorised one is captured now), whatever the
    account's capture setting."""
    if payment.status not in OPEN:  # paid already (nothing to check), or refunded: final
        return
    unavailable = AppError(
        502,
        "payment_provider_error",
        "We could not check your payment with Razorpay. If you were charged, your plan arrives "
        "within minutes; otherwise try again.",
    )
    try:
        found = await gateway.payment(payment_id)
        if found.order_id != payment.order_id or found.amount_paise != payment.amount_paise:
            raise AppError(400, "payment_mismatch", "This payment is not for this order.")
        status = found.status
        if status == "authorized":
            status = await gateway.capture(payment_id, payment.amount_paise)
    except GatewayError as e:
        raise unavailable from e
    if status != "captured":
        raise AppError(
            402,
            "payment_not_captured",
            "Razorpay has not received the money yet. If you were charged, your plan arrives "
            "within minutes.",
        )


async def capture_held(gateway: Gateway, db: AsyncSession, order_id: str, payment_id: str) -> None:
    """A payment the bank holds for one of our orders (webhook ``payment.authorized``): take
    the money, so the plan follows (``payment.captured``) even if the browser never came back.
    A second payment for an order already paid is left alone: Razorpay hands it back."""
    payment = await db.scalar(select(Payment).where(Payment.order_id == order_id))
    if payment is None:
        raise AppError(404, "payment_not_found", "No such payment.")
    if payment.status not in OPEN:
        log.warning("payments.second_payment", order_id=order_id, payment_id=payment_id)
        return
    try:
        await gateway.capture(payment_id, payment.amount_paise)
    except GatewayError:
        log.warning("payments.capture_failed", order_id=order_id)  # Razorpay's webhook retries


async def fulfil(
    db: AsyncSession, now: datetime, order_id: str, payment_id: str
) -> tuple[Payment, Mail | None]:
    """Record the payment and give the plan, once; the receipt to send, the first time."""
    payment = await _locked(db, order_id)
    paid = {"status": PaymentStatus.PAID, "payment_id": payment_id, "paid_at": now}
    if payment.status not in OPEN or not await _claim(db, payment, OPEN, **paid):
        await db.commit()  # ends the lock
        return payment, None
    user = None if payment.user_id is None else await db.get(User, payment.user_id)
    if user is None:  # the account was deleted while paying: kept as a record, nothing to give
        await db.commit()
        return payment, None
    grant = Grant(
        id=uuid.uuid4(),
        user_id=user.id,
        plan=payment.plan,
        starts_at=now,
        ends_at=now + LENGTH[Period(payment.period)],
        games_left=GAMES[Plan(payment.plan)],
        reason=f"Paid {rupees(payment.amount_paise)} for {FOR[Period(payment.period)]} "
        f"({payment_id})",
        created_at=now,
    )
    db.add(grant)
    payment.grant_id = grant.id
    await lay_out(db, user.id, now)
    await db.commit()
    name = NAMES[Plan(payment.plan)]
    when = f"until {_day(grant.ends_at)}"  # type: ignore[arg-type]
    if grant.games_left is not None:
        when = f"for {grant.games_left} games, {when} at the latest"
    if grant.starts_at > now:
        when = f"from {_day(grant.starts_at)}, after the plan time you already have, {when}"
    after = await db.scalar(  # cheaper plan time this pushed on
        select(func.max(Grant.ends_at)).where(
            Grant.user_id == user.id,
            Grant.plan.is_not(None),
            Grant.plan != payment.plan,
            Grant.revoked_at.is_(None),
            Grant.starts_at >= grant.ends_at,
        )
    )
    if after is not None:
        when += f". The plan time you had left now follows it, until {_day(after)}"
    mail = Mail(
        user.email,
        f"Your ClawPlay {name} receipt",
        f"Hello {user.username},\n\nThank you! You paid {rupees(payment.amount_paise)} for "
        f"{_what(payment)}. You have ClawPlay {name} {when}.\n\n"
        f"Payment: {payment_id}\nOrder: {payment.order_id}\n\nEnjoy your games!",
    )
    return payment, mail


async def _by_payment_id(db: AsyncSession, payment_id: str) -> Payment:
    payment = await db.scalar(
        select(Payment)
        .where(Payment.payment_id == payment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment is None:
        raise AppError(404, "payment_not_found", "No such payment.")
    return payment


async def _end_time(db: AsyncSession, payment: Payment, now: datetime) -> User | None:
    """End the plan time a payment bought (the time lined up after it moves up); its player."""
    grant = None if payment.grant_id is None else await db.get(Grant, payment.grant_id)
    if grant is not None and grant.revoked_at is None:
        grant.revoked_at = now
        await lay_out(db, grant.user_id, now)
    return None if payment.user_id is None else await db.get(User, payment.user_id)


async def refunded(
    db: AsyncSession, now: datetime, payment_id: str, refund_id: str, amount_paise: int
) -> Mail | None:
    """Record a refund, once; refunded in full, the payment's plan time ends. The email."""
    payment = await _by_payment_id(db, payment_id)
    if await db.get(Refund, refund_id) is not None:
        await db.commit()
        return None
    db.add(
        Refund(
            refund_id=refund_id, payment_id=payment.id, amount_paise=amount_paise, created_at=now
        )
    )
    await db.flush()
    total = await db.scalar(
        select(func.sum(Refund.amount_paise)).where(Refund.payment_id == payment.id)
    )
    full = (
        (total or 0) >= payment.amount_paise
        and payment.status == PaymentStatus.PAID
        and await _claim(db, payment, (PaymentStatus.PAID,), status=PaymentStatus.REFUNDED)
    )
    user = None
    if full:
        user = await _end_time(db, payment, now)
    elif payment.user_id is not None:
        user = await db.get(User, payment.user_id)
    await db.commit()
    if user is None:
        return None
    ended = f" {_what(payment)} from that payment has ended." if full else ""
    return Mail(
        user.email,
        "Your ClawPlay refund",
        f"Hello {user.username},\n\nWe have refunded {rupees(amount_paise)} of your payment "
        f"{payment_id}. It reaches you in 5 to 7 working days.{ended}",
    )


async def reversed_(db: AsyncSession, now: datetime, payment_id: str) -> Mail | None:
    """The player's bank took a payment back after a dispute: its plan time ends."""
    payment = await _by_payment_id(db, payment_id)
    if payment.status != PaymentStatus.PAID or not await _claim(
        db, payment, (PaymentStatus.PAID,), status=PaymentStatus.REVERSED
    ):
        await db.commit()
        return None
    user = await _end_time(db, payment, now)
    await db.commit()
    if user is None:
        return None
    return Mail(
        user.email,
        "Your ClawPlay payment was reversed",
        f"Hello {user.username},\n\nYour bank took back payment {payment_id} after a dispute, "
        f"so {_what(payment)} from it has ended.",
    )


async def failed(db: AsyncSession, order_id: str) -> None:
    """An attempt failed; the order stays open, so the player may try again."""
    payment = await _locked(db, order_id)
    if payment.status == PaymentStatus.CREATED:
        payment.status = PaymentStatus.FAILED
    await db.commit()


async def find(db: AsyncSession, order_id: str, user_id: uuid.UUID) -> Payment:
    payment = await db.scalar(select(Payment).where(Payment.order_id == order_id))
    if payment is None or payment.user_id != user_id:
        raise AppError(404, "payment_not_found", "No such payment.")
    return payment


async def describe(db: AsyncSession, payments: list[Payment]) -> list[PaymentOut]:
    grants = {p.grant_id for p in payments if p.grant_id is not None}
    spans = {
        row.id: (row.starts_at, row.ends_at)
        for row in await db.execute(
            select(Grant.id, Grant.starts_at, Grant.ends_at).where(Grant.id.in_(grants))
        )
    }
    return [
        PaymentOut(
            id=p.id,
            plan=p.plan,
            period=Period(p.period),
            amount_paise=p.amount_paise,
            status=PaymentStatus(p.status),
            created_at=p.created_at,
            paid_at=p.paid_at,
            starts=spans[p.grant_id][0] if p.grant_id in spans else None,
            until=spans[p.grant_id][1] if p.grant_id in spans else None,
        )
        for p in payments
    ]


async def mine(db: AsyncSession, user_id: uuid.UUID) -> list[PaymentOut]:
    """My payments, newest first (orders never paid are left out)."""
    found = await db.scalars(
        select(Payment)
        .where(Payment.user_id == user_id, Payment.status != PaymentStatus.CREATED)
        .order_by(Payment.created_at.desc())
        .limit(LISTED)
    )
    return await describe(db, list(found))
