"""Buying a plan for a month or a year.

A paid period is an ordinary grant (see ``billing``), so everything that checks features
just works. Bought time is lined up with the rest (``billing.service.lay_out``): buying again
adds on, Plus bought while Pro runs starts when Pro ends, and Pro bought on Plus moves the Plus
time left to after it. Each order is fulfilled once, whether the browser or the webhook says so
first.
"""

import uuid
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing.models import Grant
from baghchal_server.billing.plans import GAMES, NAMES, PRICES, RANK, Plan
from baghchal_server.billing.service import entitlements, lay_out
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.mail import Mail
from baghchal_server.payments.gateway import Gateway, GatewayError
from baghchal_server.payments.models import Payment
from baghchal_server.payments.schemas import (
    CheckoutIn,
    CheckoutOut,
    PaymentOut,
    PaymentStatus,
    Period,
)

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


async def _locked(db: AsyncSession, order_id: str) -> Payment:
    payment = await db.scalar(select(Payment).where(Payment.order_id == order_id).with_for_update())
    if payment is None:
        raise AppError(404, "payment_not_found", "No such payment.")
    return payment


async def fulfil(
    db: AsyncSession, now: datetime, order_id: str, payment_id: str
) -> tuple[Payment, Mail | None]:
    """Record the payment and give the plan, once; the receipt to send, the first time."""
    payment = await _locked(db, order_id)
    if payment.status == PaymentStatus.PAID:
        await db.commit()  # ends the lock
        return payment, None
    payment.status, payment.payment_id, payment.paid_at = PaymentStatus.PAID, payment_id, now
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
        when = f"from {_day(grant.starts_at)}, when your better plan ends, {when}"
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
