"""Razorpay: creating orders, and checking the signatures on what it sends back.

Checkout works in three steps: the server creates an order for the price; the browser opens
Razorpay Checkout for that order and the player pays; Razorpay hands the browser a payment id
signed with the API secret, and also calls the server's webhook, signed with the webhook
secret. Either signature proves the payment, so a closed tab never loses one.
"""

import hashlib
import hmac
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

API: str = "https://api.razorpay.com/v1"
PAYMENT_ID = re.compile(r"pay_[A-Za-z0-9]{1,40}")


class GatewayError(Exception):
    """Razorpay could not be reached, or refused the request."""


@dataclass(frozen=True)
class PaymentState:
    """What Razorpay says of a payment."""

    order_id: str | None
    amount_paise: int
    status: str
    """``created``, ``authorized`` (the bank holds the money), ``captured`` (it is ours),
    ``refunded`` or ``failed``."""


class Gateway(Protocol):
    key_id: str

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict[str, str]) -> str:
        """Create an order in rupees and return its id (``order_…``)."""
        ...

    async def payment(self, payment_id: str) -> PaymentState:
        """Ask Razorpay about a payment."""
        ...

    async def capture(self, payment_id: str, amount_paise: int) -> str:
        """Take an authorised payment's money; the payment's status after."""
        ...

    async def close(self) -> None: ...


class RazorpayGateway:
    def __init__(
        self, key_id: str, key_secret: str, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.key_id = key_id
        self._client = httpx.AsyncClient(
            base_url=API, auth=(key_id, key_secret), timeout=10, transport=transport
        )

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict[str, str]) -> str:
        try:
            r = await self._client.post(
                "/orders",
                json={
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": receipt,
                    "notes": notes,
                },
            )
        except httpx.HTTPError as e:
            raise GatewayError(str(e)) from e
        if r.status_code != 200:
            raise GatewayError(f"Razorpay answered {r.status_code}: {r.text[:200]}")
        order_id: str = r.json()["id"]
        return order_id

    async def _call(
        self, method: str, path: str, body: dict[str, object] | None = None
    ) -> dict[str, object]:
        try:
            r = await self._client.request(method, path, json=body)
        except httpx.HTTPError as e:
            raise GatewayError(str(e)) from e
        if r.status_code != 200:
            raise GatewayError(f"Razorpay answered {r.status_code}: {r.text[:200]}")
        found: dict[str, object] = r.json()
        return found

    async def payment(self, payment_id: str) -> PaymentState:
        found = await self._call("GET", f"/payments/{_safe(payment_id)}")
        order_id, amount = found.get("order_id"), found.get("amount")
        return PaymentState(
            order_id if isinstance(order_id, str) else None,
            amount if isinstance(amount, int) else 0,
            str(found.get("status", "")),
        )

    async def capture(self, payment_id: str, amount_paise: int) -> str:
        found = await self._call(
            "POST",
            f"/payments/{_safe(payment_id)}/capture",
            {"amount": amount_paise, "currency": "INR"},
        )
        return str(found.get("status", ""))

    async def close(self) -> None:
        await self._client.aclose()


def _safe(payment_id: str) -> str:
    """A ``pay_…`` id, checked before it goes in a URL."""
    if not PAYMENT_ID.fullmatch(payment_id):
        raise GatewayError("not a Razorpay payment id")
    return payment_id


def _sign(message: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def payment_signed(order_id: str, payment_id: str, signature: str, key_secret: str) -> bool:
    """Whether Checkout's ``razorpay_signature`` is genuine (signed with the API secret)."""
    expected = _sign(f"{order_id}|{payment_id}".encode(), key_secret)
    return hmac.compare_digest(expected, signature)


def webhook_signed(body: bytes, signature: str, webhook_secret: str) -> bool:
    """Whether a webhook's ``X-Razorpay-Signature`` is genuine (signed with its secret)."""
    return bool(webhook_secret) and hmac.compare_digest(_sign(body, webhook_secret), signature)
