import json
from typing import Annotated, Any, Final

from fastapi import APIRouter, BackgroundTasks, Header, Request

from baghchal_server.admin_check import Admin, CheckedAdmin, check_code, send_code
from baghchal_server.billing.plans import Plan
from baghchal_server.deps import DB, AppState, CurrentUser, Member, State, enforce_limit
from baghchal_server.errors import AppError
from baghchal_server.mail import deliver
from baghchal_server.payments import keys as payment_keys
from baghchal_server.payments import service
from baghchal_server.payments.gateway import Gateway, payment_signed, webhook_signed
from baghchal_server.payments.keys import Keys
from baghchal_server.payments.schemas import (
    AdminCheckOut,
    AdminCodeIn,
    CheckoutIn,
    CheckoutOut,
    PaymentKeysIn,
    PaymentKeysOut,
    PaymentOut,
    PaymentsOut,
    VerifyIn,
)
from baghchal_server.ratelimit import Limit

router = APIRouter(prefix="/api/v1")

CHECKOUTS_PER_USER: Final = Limit("checkout", 30, 3600)
PARENT_TOLD: Final = Limit("parent_told_of_plan", 1, 86400)
"""A parent hears of each plan a player under 18 tried to buy once a day at most."""


CODES_SENT: Final = Limit("admin_code_sent", 5, 3600)
CODES_TRIED: Final = Limit("admin_code_tried", 5, 900)


async def _keys(state: AppState, db: DB) -> Keys:
    found = await payment_keys.load(db, state.settings)
    if found is None:
        raise AppError(503, "payments_off", "Paying online is not available yet.")
    return found


def _gateway(state: AppState, keys: Keys) -> Gateway:
    return state.gateways.get(keys)


@router.get("/me/payments")
async def my_payments(user: CurrentUser, state: State, db: DB) -> PaymentsOut:
    """Whether payments are taken, and mine (paid or failed), newest first."""
    on = await payment_keys.load(db, state.settings) is not None
    return PaymentsOut(enabled=on, payments=await service.mine(db, user.id))


@router.post("/payments/checkout", status_code=201)
async def checkout(data: CheckoutIn, user: Member, state: State, db: DB) -> CheckoutOut:
    """Start buying a plan for a month or a year: an order to pay with Razorpay Checkout."""
    gateway = _gateway(state, await _keys(state, db))
    await enforce_limit(state, CHECKOUTS_PER_USER, str(user.id))
    now = state.clock()
    if service.under_18(user, now):
        plan = Plan(data.plan)
        mail = service.parent_mail(state.settings, user, plan)
        if mail is not None and not await state.limiter.hit(PARENT_TOLD, f"{user.id}:{plan}"):
            await deliver(state.mailer, mail)  # now: the error below drops background tasks
        told = " We have told your parent or guardian by email." if mail is not None else ""
        raise AppError(403, "under_18", f"Players under 18 cannot buy plans.{told}")
    return await service.checkout(db, gateway, user, now, data)


@router.post("/payments/verify")
async def verify(
    data: VerifyIn, user: CurrentUser, state: State, db: DB, tasks: BackgroundTasks
) -> PaymentOut:
    """Confirm a payment from what Checkout handed the browser, and give the plan."""
    keys = await _keys(state, db)
    if not payment_signed(data.order_id, data.payment_id, data.signature, keys.key_secret):
        raise AppError(400, "bad_signature", "This payment could not be confirmed.")
    found = await service.find(db, data.order_id, user.id)
    await service.captured(_gateway(state, keys), found, data.payment_id)
    payment, mail = await service.fulfil(db, state.clock(), data.order_id, data.payment_id)
    if mail is not None:
        tasks.add_task(deliver, state.mailer, mail)
    (out,) = await service.describe(db, [payment])
    return out


@router.post("/payments/webhook", include_in_schema=False)
async def webhook(
    request: Request,
    state: State,
    db: DB,
    tasks: BackgroundTasks,
    signature: Annotated[str, Header(alias="X-Razorpay-Signature")] = "",
) -> dict[str, str]:
    """Razorpay's word on a payment, for when the browser never came back."""
    body = await request.body()
    keys = await payment_keys.load(db, state.settings)
    if keys is None or not webhook_signed(body, signature, keys.webhook_secret):
        raise AppError(400, "bad_signature", "Bad signature.")
    event: dict[str, Any] = json.loads(body)
    name, payload = event.get("event"), event.get("payload", {})
    if name in {"refund.processed", "payment.dispute.lost"}:
        return await _money_back(state, db, tasks, name, payload)
    entity = payload.get("payment", {}).get("entity", {})
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    if not order_id or not payment_id:
        return {"status": "ignored"}
    try:
        if name in {"payment.captured", "order.paid"}:
            _, mail = await service.fulfil(db, state.clock(), order_id, payment_id)
            if mail is not None:
                tasks.add_task(deliver, state.mailer, mail)
        elif name == "payment.failed":
            await service.failed(db, order_id)
        elif name == "payment.authorized":
            await service.capture_held(_gateway(state, keys), db, order_id, payment_id)
    except AppError:  # an order made elsewhere (another site on the same Razorpay account)
        return {"status": "ignored"}
    return {"status": "ok"}


async def _money_back(
    state: AppState, db: DB, tasks: BackgroundTasks, name: str, payload: dict[str, Any]
) -> dict[str, str]:
    """A refund, or a dispute lost to the player's bank: the plan time the payment bought ends."""
    try:
        if name == "refund.processed":
            refund = payload.get("refund", {}).get("entity", {})
            refund_id, payment_id, amount = (
                refund.get("id"),
                refund.get("payment_id"),
                refund.get("amount"),
            )
            if not refund_id or not payment_id or not isinstance(amount, int):
                return {"status": "ignored"}
            mail = await service.refunded(db, state.clock(), payment_id, refund_id, amount)
        else:
            payment_id = payload.get("dispute", {}).get("entity", {}).get("payment_id")
            if not payment_id:
                return {"status": "ignored"}
            mail = await service.reversed_(db, state.clock(), payment_id)
    except AppError:  # a payment made elsewhere
        return {"status": "ignored"}
    if mail is not None:
        tasks.add_task(deliver, state.mailer, mail)
    return {"status": "ok"}


# ── The payments page (admins, with a code by email) ──────────────────────


@router.post("/admin/code", status_code=202)
async def admin_code(
    request: Request, admin: Admin, state: State, db: DB, tasks: BackgroundTasks
) -> dict[str, str]:
    """Email me a code that opens the payments page on this device."""
    await enforce_limit(state, CODES_SENT, str(admin.id))
    mail = await send_code(request, state, db, admin)
    tasks.add_task(deliver, state.mailer, mail)
    return {"status": "accepted"}


@router.post("/admin/code/check")
async def admin_code_check(
    data: AdminCodeIn, request: Request, admin: Admin, state: State, db: DB
) -> AdminCheckOut:
    """Enter the emailed code: this device may use the payments page for 15 minutes."""
    await enforce_limit(state, CODES_TRIED, str(admin.id))
    return AdminCheckOut(until=await check_code(request, state, db, admin, data.code))


@router.get("/admin/payment-keys")
async def get_payment_keys(admin: CheckedAdmin, state: State, db: DB) -> PaymentKeysOut:
    """Whether payments are on, with which key id, set when and by whom (never the secrets)."""
    return await payment_keys.describe(db, state.settings)


@router.put("/admin/payment-keys")
async def put_payment_keys(
    data: PaymentKeysIn, admin: CheckedAdmin, state: State, db: DB, tasks: BackgroundTasks
) -> PaymentKeysOut:
    """Set the Razorpay keys: payments are taken with them at once. Every admin is told."""
    for mail in await payment_keys.save(db, state.settings, admin, state.clock(), data):
        tasks.add_task(deliver, state.mailer, mail)
    return await payment_keys.describe(db, state.settings)


@router.delete("/admin/payment-keys")
async def delete_payment_keys(
    admin: CheckedAdmin, state: State, db: DB, tasks: BackgroundTasks
) -> PaymentKeysOut:
    """Remove the keys: payments are off. Every admin is told."""
    for mail in await payment_keys.remove(db, admin):
        tasks.add_task(deliver, state.mailer, mail)
    return await payment_keys.describe(db, state.settings)
