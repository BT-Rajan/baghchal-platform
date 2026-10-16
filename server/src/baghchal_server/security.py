"""Password hashing and opaque tokens."""

import hashlib
import secrets

import anyio
from argon2 import PasswordHasher as _Argon2
from argon2.exceptions import InvalidHashError, VerificationError


class PasswordHasher:
    """Argon2id (RFC 9106 parameters), run off the event loop with bounded concurrency.

    Each hash takes tens of milliseconds and 64 MiB of memory, so it runs in a worker
    thread, and a limiter stops a burst of logins from exhausting memory.
    """

    def __init__(self, max_concurrent: int) -> None:
        self._argon = _Argon2()
        self._limiter = anyio.CapacityLimiter(max_concurrent)
        # Verified against when an account does not exist, so a failed login takes the same
        # time whether or not the username is registered.
        self._dummy_hash = self._argon.hash(secrets.token_hex(16))

    async def hash(self, password: str) -> str:
        return await anyio.to_thread.run_sync(self._argon.hash, password, limiter=self._limiter)

    async def verify(self, password_hash: str | None, password: str) -> bool:
        target = self._dummy_hash if password_hash is None else password_hash
        ok = await anyio.to_thread.run_sync(self._check, target, password, limiter=self._limiter)
        return ok and password_hash is not None

    def needs_rehash(self, password_hash: str) -> bool:
        return self._argon.check_needs_rehash(password_hash)

    def _check(self, password_hash: str, password: str) -> bool:
        try:
            return self._argon.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False


TOKEN_BYTES = 32


def new_token() -> tuple[str, str]:
    """Return ``(token, token_hash)``: give the token to the user, store only the hash."""
    token = secrets.token_urlsafe(TOKEN_BYTES)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    # Tokens carry 256 bits of randomness, so a fast unsalted hash is the right tool: it
    # keeps lookups cheap and a database leak still reveals no usable token.
    return hashlib.sha256(token.encode()).hexdigest()
