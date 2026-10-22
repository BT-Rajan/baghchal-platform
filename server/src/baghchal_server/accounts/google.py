"""Signing in with Google: checking the ID token the app got from Google.

The token is a JWT signed by Google with RS256. It is trusted only when its signature checks
out against Google's published keys (fetched from ``CERTS_URL`` and cached as Google's
``Cache-Control`` allows), and its claims say Google issued it, to one of ClawPlay's client
ids (``BAGHCHAL_GOOGLE_CLIENT_IDS``), that it has not expired, and that Google has verified the
email address. The signature is checked with ``cryptography`` (no JWT library is needed).
"""

import asyncio
import base64
import binascii
import json
import math
import re
import time
from collections.abc import Awaitable, Callable, Collection
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

import httpx
import structlog
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey, RSAPublicNumbers
from cryptography.hazmat.primitives.hashes import SHA256

from baghchal_server.errors import AppError

log = structlog.get_logger(__name__)

CERTS_URL: Final = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS: Final = frozenset({"accounts.google.com", "https://accounts.google.com"})
LEEWAY_SECONDS: Final = 60
"""Clock difference allowed between Google's servers and ours."""
DEFAULT_MAX_AGE: Final = 3600
LONGEST_CACHE: Final = 24 * 3600
REFETCH_GAP: Final = 60.0
"""A token signed with a key we do not know fetches the keys again, at most this often (in
seconds), so made-up key ids cannot make us hammer Google."""

Jwks = dict[str, Any]
Fetch = Callable[[], Awaitable[tuple[Jwks, int]]]
"""Gets Google's keys (a JWK set) and how many seconds they may be cached."""


@dataclass(frozen=True, slots=True)
class GoogleIdentity:
    subject: str
    """Google's id for the account (``sub``): never changes, unlike the address."""
    email: str
    """Verified by Google."""


async def fetch_google_keys() -> tuple[Jwks, int]:
    async with httpx.AsyncClient(timeout=10) as http:
        response = await http.get(CERTS_URL)
        response.raise_for_status()
    match = re.search(r"max-age=(\d+)", response.headers.get("cache-control", ""))
    jwks: Jwks = response.json()
    return jwks, int(match.group(1)) if match else DEFAULT_MAX_AGE


def _b64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _rsa_key(jwk: dict[str, Any]) -> RSAPublicKey:
    n = int.from_bytes(_b64(jwk["n"]), "big")
    e = int.from_bytes(_b64(jwk["e"]), "big")
    return RSAPublicNumbers(e, n).public_key()


class GoogleKeys:
    """Google's signing keys, cached. ``fetch`` is replaceable, for tests."""

    def __init__(self, fetch: Fetch = fetch_google_keys) -> None:
        self.fetch = fetch
        self._keys: dict[str, RSAPublicKey] = {}
        self._expires = -math.inf
        self._fetched = -math.inf
        self._lock = asyncio.Lock()

    def _stale(self, kid: str) -> bool:
        now = time.monotonic()
        return now >= self._expires or (
            kid not in self._keys and now - self._fetched >= REFETCH_GAP
        )

    async def key(self, kid: str) -> RSAPublicKey | None:
        if self._stale(kid):
            async with self._lock:
                if self._stale(kid):  # another request may have fetched them meanwhile
                    await self._refresh()
        return self._keys.get(kid)

    async def _refresh(self) -> None:
        now = time.monotonic()
        self._fetched = now
        try:
            jwks, max_age = await self.fetch()
            keys = {
                jwk["kid"]: _rsa_key(jwk)
                for jwk in jwks.get("keys", [])
                if jwk.get("kty") == "RSA" and isinstance(jwk.get("kid"), str)
            }
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            log.warning("google.keys_unavailable", exc_info=True)
            if not self._keys:
                raise AppError(
                    503, "google_unavailable", "Google sign-in is not available. Try again soon."
                ) from None
            return  # keep the keys we have
        self._keys = keys
        self._expires = now + max(REFETCH_GAP, min(max_age, LONGEST_CACHE))


def invalid_google_token() -> AppError:
    return AppError(401, "invalid_google_token", "Google sign-in did not work. Try again.")


def _decode(token: str) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    """The header, the claims, the signature and the signed bytes of a JWT."""
    parts = token.split(".")
    if len(parts) != 3:  # noqa: PLR2004 - header, claims, signature
        raise invalid_google_token()
    try:
        header, claims = json.loads(_b64(parts[0])), json.loads(_b64(parts[1]))
        signature = _b64(parts[2])
        signed = f"{parts[0]}.{parts[1]}".encode("ascii")
    except (ValueError, binascii.Error, UnicodeError):
        raise invalid_google_token() from None
    if not isinstance(header, dict) or not isinstance(claims, dict):
        raise invalid_google_token()
    return header, claims, signature, signed


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


async def verify(
    keys: GoogleKeys, token: str, audiences: Collection[str], now: datetime
) -> GoogleIdentity:
    """The Google account a valid ID token is for; raises ``invalid_google_token`` (or
    ``google_email_unverified``) otherwise."""
    header, claims, signature, signed = _decode(token)
    kid = header.get("kid")
    if header.get("alg") != "RS256" or not isinstance(kid, str):
        raise invalid_google_token()
    key = await keys.key(kid)
    if key is None:
        raise invalid_google_token()
    try:
        key.verify(signature, signed, PKCS1v15(), SHA256())
    except InvalidSignature:
        raise invalid_google_token() from None

    aud = claims.get("aud")
    issued_to = [aud] if isinstance(aud, str) else aud if isinstance(aud, list) else []
    expires, issued = _number(claims.get("exp")), _number(claims.get("iat"))
    at = now.timestamp()
    subject, email = claims.get("sub"), claims.get("email")
    if (
        claims.get("iss") not in ISSUERS
        or not any(isinstance(a, str) and a in audiences for a in issued_to)
        or expires is None
        or expires + LEEWAY_SECONDS <= at
        or (issued is not None and issued - LEEWAY_SECONDS > at)
        or not isinstance(subject, str)
        or not subject
        or not isinstance(email, str)
        or "@" not in email
    ):
        raise invalid_google_token()
    if claims.get("email_verified") not in (True, "true"):
        raise AppError(
            403,
            "google_email_unverified",
            "Your Google account's email is not verified. Sign up with a password instead.",
        )
    return GoogleIdentity(subject=subject, email=email.strip())
