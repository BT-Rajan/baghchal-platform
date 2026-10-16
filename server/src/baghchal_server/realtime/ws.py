"""The WebSocket endpoint: one connection per open app or browser tab.

Security:
- Browsers authenticate with the session cookie and must send an allowed Origin (otherwise any
  site could open a socket with the visitor's cookie). Apps use ``Authorization: Bearer``.
- The session is re-checked periodically, so signing out or a password reset also closes
  sockets that are already open.
- Messages are size-limited and rate-limited; a client that stops reading is disconnected.
"""

import asyncio
import time
from typing import Final

import structlog
from fastapi import APIRouter, WebSocket
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import resolve_session
from baghchal_server.deps import AppState, session_token
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.realtime import presence as presence_module
from baghchal_server.realtime.hub import Connection
from baghchal_server.realtime.protocol import ErrorEvent, Hello, Pong, client_message

log = structlog.get_logger(__name__)
router = APIRouter()

MAX_MESSAGE_CHARS: Final = 4096
MESSAGES_PER_SECOND: Final = 10.0
MESSAGE_BURST: Final = 20.0
SESSION_CHECK_SECONDS = 60.0

# Close codes (4000-4999 are ours to define).
CLOSE_UNSUPPORTED = 1003
CLOSE_TOO_BIG = 1009
CLOSE_SIGNED_OUT = 4401
CLOSE_TOO_SLOW = 4408
CLOSE_RATE_LIMITED = 4429


class _TokenBucket:
    def __init__(self, rate: float, burst: float) -> None:
        self.rate, self.burst = rate, burst
        self.tokens, self.stamp = burst, time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        self.tokens = min(self.burst, self.tokens + (now - self.stamp) * self.rate)
        self.stamp = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


async def _authenticate(ws: WebSocket, state: AppState) -> tuple[User, str] | None:
    token, transport = session_token(ws, state.settings)
    origin = ws.headers.get("origin")
    if origin is not None and origin not in state.settings.allowed_origins:
        return None
    if transport == "cookie" and origin is None:
        return None
    if not token:
        return None
    async with state.sessions() as db:
        user = await resolve_session(db, token, state.clock())
    return (user, token) if user is not None else None


@router.websocket("/api/v1/ws")
async def socket(ws: WebSocket) -> None:
    state: AppState = ws.app.state.ctx
    auth = await _authenticate(ws, state)
    if auth is None:
        await ws.close(code=1008)  # before accept, this rejects the handshake with HTTP 403
        return
    user, token = auth
    await ws.accept()
    conn = Connection(user.id)
    await state.hub.attach(conn)
    await state.presence.touch(user.id, conn.id)
    log.info("ws.open", user_id=str(user.id), conn_id=conn.id)
    tasks: set[asyncio.Task[int | None]] = set()
    try:
        await ws.send_text(
            Hello(user=PlayerOut(id=user.id, username=user.username)).model_dump_json()
        )
        tasks = {
            asyncio.create_task(_read(ws, conn)),
            asyncio.create_task(_write(ws, conn)),
            asyncio.create_task(_keep_alive(state, conn, token)),
            asyncio.create_task(_watch_overflow(conn)),
        }
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        code = next(iter(done)).result()
        if code is not None and ws.application_state is WebSocketState.CONNECTED:
            await ws.close(code=code)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await state.hub.detach(conn)
        await state.presence.remove(user.id, conn.id)
        log.info("ws.close", user_id=str(user.id), conn_id=conn.id)


async def _read(ws: WebSocket, conn: Connection) -> int | None:
    """Handle client messages; returns a close code, or None if the client went away."""
    bucket = _TokenBucket(MESSAGES_PER_SECOND, MESSAGE_BURST)
    while True:
        message = await ws.receive()
        if message["type"] == "websocket.disconnect":
            return None
        text = message.get("text")
        if text is None:
            return CLOSE_UNSUPPORTED
        if len(text) > MAX_MESSAGE_CHARS:
            return CLOSE_TOO_BIG
        if not bucket.take():
            return CLOSE_RATE_LIMITED
        try:
            client_message.validate_json(text)  # only "ping" exists so far
        except ValidationError:
            conn.offer(
                ErrorEvent(
                    code="invalid_message", message="Unknown or malformed message."
                ).model_dump_json()
            )
            continue
        conn.offer(Pong().model_dump_json())


async def _write(ws: WebSocket, conn: Connection) -> int | None:
    while True:
        message = await conn.outbox.get()
        try:
            await ws.send_text(message)
        except Exception:  # the client is gone; the reader will see the disconnect too
            return None


async def _keep_alive(state: AppState, conn: Connection, token: str) -> int | None:
    last_check = time.monotonic()
    while True:
        await asyncio.sleep(presence_module.HEARTBEAT)
        await state.presence.touch(conn.user_id, conn.id)
        if time.monotonic() - last_check >= SESSION_CHECK_SECONDS:
            last_check = time.monotonic()
            async with state.sessions() as db:
                if await resolve_session(db, token, state.clock()) is None:
                    return CLOSE_SIGNED_OUT


async def _watch_overflow(conn: Connection) -> int:
    await conn.overflowed.wait()
    return CLOSE_TOO_SLOW
