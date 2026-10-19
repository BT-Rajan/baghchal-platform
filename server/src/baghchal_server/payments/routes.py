import json
from typing import Annotated, Any, Final

from fastapi import APIRouter, BackgroundTasks, Header, Request

from baghchal_server.deps import DB, AppState, CurrentUser, State, enforce_limit
from baghchal_server.errors import AppError
from baghchal_server.mail import deliver
from baghchal_server.payments import service
from baghchal_server.payments.gateway import Gateway, payment_signed, webhook_signed
from baghchal_server.payments.schemas import (
    CheckoutIn,
    CheckoutOut,
    PaymentOut,
    PaymentsOut,
    VerifyIn,
)
from baghchal_server.ratelimit import Limit

router = APIRouter(prefix="/api/v1")

CHECKOUTS_PER_USER: Final = Limit("checkout", 30, 3600)


def _gateway(state: AppState) -> Gateway:
    if state.gateway is None:
        raise AppError(503, "payments_off", "Paying online is not available yet.")
    return state.gateway


@router.get("/me/payments")
async def my_payments(user: CurrentUser, state: State, db: DB) -> PaymentsOut:
    """Whether payments are taken, and mine (paid or failed), newest first."""
    return PaymentsOut(enabled=state.gateway is not None, payments=await service.mine(db, user.id))


@router.post("/payments/checkout", status_code=201)
async def checkout(data: CheckoutIn, user: CurrentUser, state: State, db: DB) -> CheckoutOut:
    """Start buying a plan for a month or a year: an order to pay with Razorpay Checkout."""
    gateway = _gateway(state)
    await enforce_limit(state, CHECKOUTS_PER_USER, str(user.id))
    return await service.checkout(db, gateway, user, state.clock(), data)


@router.post("/payments/verify")
async def verify(
    data: VerifyIn, user: CurrentUser, state: State, db: DB, tasks: BackgroundTasks
) -> PaymentOut:
    """Confirm a payment from what Checkout handed the browser, and give the plan."""
    _gateway(state)
    secret = state.settings.razorpay_key_secret.get_secret_value()
    if not payment_signed(data.order_id, data.payment_id, data.signature, secret):
        raise AppError(400, "bad_signature", "This payment could not be confirmed.")
    await service.find(db, data.order_id, user.id)
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
    if not webhook_signed(
        body, signature, state.settings.razorpay_webhook_secret.get_secret_value()
    ):
        raise AppError(400, "bad_signature", "Bad signature.")
    event: dict[str, Any] = json.loads(body)
    entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    if not order_id or not payment_id:
        return {"status": "ignored"}
    try:
        if event.get("event") in {"payment.captured", "order.paid"}:
            _, mail = await service.fulfil(db, state.clock(), order_id, payment_id)
            if mail is not None:
                tasks.add_task(deliver, state.mailer, mail)
        elif event.get("event") == "payment.failed":
            await service.failed(db, order_id)
    except AppError:  # an order made elsewhere (another site on the same Razorpay account)
        return {"status": "ignored"}
    return {"status": "ok"}
