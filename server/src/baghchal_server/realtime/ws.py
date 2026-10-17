"""The WebSocket endpoint: one connection per open app or browser tab.

Security:
- Browsers authenticate with the session cookie and must send an allowed Origin (otherwise any
  site could open a socket with the visitor's cookie). Apps use ``Authorization: Bearer``.
- The session is re-checked periodically, so signing out or a password reset also closes
  sockets that are already open.
- Messages are size-limited and rate-limited; a client that stops reading is disconnected.
- A client that goes silent is disconnected too (a phone app suspended in the background
  keeps its connection open without answering), so it stops counting as online.
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
from baghchal_server.realtime.protocol import ErrorEvent, Hello, Ping, Pong, Probe, client_message

log = structlog.get_logger(__name__)
router = APIRouter()

MAX_MESSAGE_CHARS: Final = 4096
MESSAGES_PER_SECOND: Final = 10.0
MESSAGE_BURST: Final = 20.0
SESSION_CHECK_SECONDS = 60.0
IDLE_SECONDS = 90.0
MAX_ROUND_TRIP_MS: Final = 5_000.0
"""Echoes slower than this are not measurements of the network (the client was busy)."""
SMOOTHING: Final = 0.3
"""Weight of each new round trip in the running average."""
"""Clients ping every 25 seconds; one silent this long is gone. Generous, because browsers
slow down timers in background tabs."""

# Close codes (4000-4999 are ours to define).
CLOSE_UNSUPPORTED = 1003
CLOSE_TOO_BIG = 1009
CLOSE_SIGNED_OUT = 4401
CLOSE_TOO_SLOW = 4408
CLOSE_IDLE = 4410
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
    await state.presence.seen(user.id, state.clock())
    log.info("ws.open", user_id=str(user.id), conn_id=conn.id)
    tasks: set[asyncio.Task[int | None]] = set()
    try:
        await ws.send_text(
            Hello(user=PlayerOut(id=user.id, username=user.username)).model_dump_json()
        )
        _probe(conn)  # measure the round trip early: a game may start any moment
        tasks = {
            asyncio.create_task(_read(ws, state, conn)),
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
        await state.presence.seen(user.id, state.clock())
        log.info("ws.close", user_id=str(user.id), conn_id=conn.id)


def _probe(conn: Connection) -> None:
    conn.probes_sent += 1
    conn.probe = (conn.probes_sent, time.monotonic())
    conn.offer(Probe(id=conn.probes_sent).model_dump_json())


async def _echoed(state: AppState, conn: Connection, probe: Probe) -> None:
    """A probe came back: update the client's round trip (only the latest probe counts)."""
    if conn.probe is None or probe.id != conn.probe[0]:
        return
    sample = (time.monotonic() - conn.probe[1]) * 1000
    conn.probe = None
    if sample > MAX_ROUND_TRIP_MS:
        return
    previous = conn.round_trip_ms
    conn.round_trip_ms = sample if previous is None else previous + SMOOTHING * (sample - previous)
    await state.presence.record_round_trip(conn.user_id, round(conn.round_trip_ms))


async def _read(ws: WebSocket, state: AppState, conn: Connection) -> int | None:
    """Handle client messages; returns a close code, or None if the client went away."""
    bucket = _TokenBucket(MESSAGES_PER_SECOND, MESSAGE_BURST)
    while True:
        message = await ws.receive()
        if message["type"] == "websocket.disconnect":
            return None
        conn.last_heard = time.monotonic()
        text = message.get("text")
        if text is None:
            return CLOSE_UNSUPPORTED
        if len(text) > MAX_MESSAGE_CHARS:
            return CLOSE_TOO_BIG
        if not bucket.take():
            return CLOSE_RATE_LIMITED
        try:
            parsed: Ping | Probe = client_message.validate_json(text)
        except ValidationError:
            conn.offer(
                ErrorEvent(
                    code="invalid_message", message="Unknown or malformed message."
                ).model_dump_json()
            )
            continue
        if isinstance(parsed, Probe):
            await _echoed(state, conn, parsed)
        else:
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
        if time.monotonic() - conn.last_heard > IDLE_SECONDS:
            return CLOSE_IDLE
        await state.presence.touch(conn.user_id, conn.id)
        await state.presence.seen(conn.user_id, state.clock())
        _probe(conn)
        if time.monotonic() - last_check >= SESSION_CHECK_SECONDS:
            last_check = time.monotonic()
            async with state.sessions() as db:
                if await resolve_session(db, token, state.clock()) is None:
                    return CLOSE_SIGNED_OUT


async def _watch_overflow(conn: Connection) -> int:
    await conn.overflowed.wait()
    return CLOSE_TOO_SLOW
