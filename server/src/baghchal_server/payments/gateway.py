"""Razorpay: creating orders, and checking the signatures on what it sends back.

Checkout works in three steps: the server creates an order for the price; the browser opens
Razorpay Checkout for that order and the player pays; Razorpay hands the browser a payment id
signed with the API secret, and also calls the server's webhook, signed with the webhook
secret. Either signature proves the payment, so a closed tab never loses one.
"""

import hashlib
import hmac
from typing import Protocol

import httpx

API: str = "https://api.razorpay.com/v1"


class GatewayError(Exception):
    """Razorpay could not be reached, or refused the request."""


class Gateway(Protocol):
    key_id: str

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict[str, str]) -> str:
        """Create an order in rupees and return its id (``order_…``)."""
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

    async def close(self) -> None:
        await self._client.aclose()


def _sign(message: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def payment_signed(order_id: str, payment_id: str, signature: str, key_secret: str) -> bool:
    """Whether Checkout's ``razorpay_signature`` is genuine (signed with the API secret)."""
    expected = _sign(f"{order_id}|{payment_id}".encode(), key_secret)
    return hmac.compare_digest(expected, signature)


def webhook_signed(body: bytes, signature: str, webhook_secret: str) -> bool:
    """Whether a webhook's ``X-Razorpay-Signature`` is genuine (signed with its secret)."""
    return bool(webhook_secret) and hmac.compare_digest(_sign(body, webhook_secret), signature)
