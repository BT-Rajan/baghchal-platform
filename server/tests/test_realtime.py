import asyncio
import os
import time
import uuid
from contextlib import AsyncExitStack
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx_ws import WebSocketDisconnect, WebSocketUpgradeError
from redis.asyncio import Redis

from baghchal_server.deps import AppState
from baghchal_server.mail import MemoryMailer
from baghchal_server.realtime import hub as hub_module
from baghchal_server.realtime import presence as presence_module
from baghchal_server.realtime import ws as ws_module
from baghchal_server.realtime.hub import OUTBOX_SIZE, Connection, Hub, MemoryBroker, RedisBroker
from baghchal_server.realtime.presence import MemoryPresence, Presence, RedisPresence

from .conftest import ORIGIN, Clock, PlayerFactory, open_socket, sign_up

REDIS_URL = os.environ.get("BAGHCHAL_TEST_REDIS_URL")
needs_redis = pytest.mark.skipif(not REDIS_URL, reason="set BAGHCHAL_TEST_REDIS_URL")


async def _receive(ws: Any) -> dict[str, Any]:
    """The next message, skipping round-trip probes (a client may leave them unanswered)."""
    while True:
        message: dict[str, Any] = await asyncio.wait_for(ws.receive_json(), timeout=2)
        if message["type"] != "probe":
            return message


async def _assert_refused(app: FastAPI, headers: dict[str, str], cookies: Any = None) -> None:
    """The handshake is rejected. (A real server answers HTTP 403; the in-process test
    transport reports a close with code 1008 before the socket opens.)"""
    error: BaseException | None = None
    try:
        async with open_socket(app, headers, cookies=cookies):
            pass
    except BaseException as e:
        error = e
    while isinstance(error, BaseExceptionGroup) and len(error.exceptions) == 1:
        error = error.exceptions[0]
    if isinstance(error, WebSocketUpgradeError):
        assert error.response.status_code == 403
    else:
        assert isinstance(error, WebSocketDisconnect), error
        assert error.code == 1008


async def _closed_with(ws: Any) -> int:
    """Read until the server closes the socket; return the close code."""
    while True:
        try:
            await asyncio.wait_for(ws.receive_text(), timeout=2)
        except WebSocketDisconnect as closed:
            return int(closed.code)


# ── Handshake and authentication ──────────────────────────────────────────


async def test_bearer_socket(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        assert await _receive(ws) == {
            "type": "hello",
            "user": {"id": alice.id, "username": "alice", "badge": None},
        }
        await ws.send_json({"type": "ping"})
        assert await _receive(ws) == {"type": "pong"}


async def test_cookie_socket_needs_an_allowed_origin(
    app: FastAPI, client: httpx.AsyncClient, mailer: MemoryMailer
) -> None:
    await sign_up(client, mailer)
    async with open_socket(app, {"origin": ORIGIN}, cookies=client.cookies) as ws:
        assert (await _receive(ws))["user"]["username"] == "alice"
    for headers in ({}, {"origin": "https://evil.example"}):
        await _assert_refused(app, headers, cookies=client.cookies)


@pytest.mark.parametrize(
    "headers",
    [{}, {"authorization": "Bearer nonsense"}, {"origin": ORIGIN}],
)
async def test_unauthenticated_sockets_are_refused(app: FastAPI, headers: dict[str, str]) -> None:
    await _assert_refused(app, headers)


async def test_bearer_socket_from_a_foreign_origin_is_refused(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice = await players("alice")
    await _assert_refused(app, {**alice.auth, "origin": "https://evil.example"})


# ── Messages and abuse ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text", ['{"type": "dance"}', "not json", '{"type": "ping", "x": 1}', "[]"]
)
async def test_invalid_messages_get_an_error(
    app: FastAPI, players: PlayerFactory, text: str
) -> None:
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        await _receive(ws)
        await ws.send_text(text)
        assert (await _receive(ws))["code"] == "invalid_message"
        await ws.send_json({"type": "ping"})  # still usable
        assert await _receive(ws) == {"type": "pong"}


async def test_binary_frames_close_the_socket(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        await _receive(ws)
        await ws.send_bytes(b"\x00\x01")
        assert await _closed_with(ws) == ws_module.CLOSE_UNSUPPORTED


async def test_oversized_messages_close_the_socket(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        await _receive(ws)
        await ws.send_text("x" * (ws_module.MAX_MESSAGE_CHARS + 1))
        assert await _closed_with(ws) == ws_module.CLOSE_TOO_BIG


async def test_flooding_closes_the_socket(app: FastAPI, players: PlayerFactory) -> None:
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        await _receive(ws)
        for _ in range(int(ws_module.MESSAGE_BURST) + 5):
            await ws.send_json({"type": "ping"})
        assert await _closed_with(ws) == ws_module.CLOSE_RATE_LIMITED


async def test_signing_out_closes_open_sockets(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(presence_module, "HEARTBEAT", 0.05)
    monkeypatch.setattr(ws_module, "SESSION_CHECK_SECONDS", 0.12)  # every few heartbeats
    alice = await players("alice")
    async with open_socket(app, alice.auth) as ws:
        await _receive(ws)
        await asyncio.sleep(0.15)  # a few heartbeats with a valid session: still open
        await ws.send_json({"type": "ping"})
        assert await _receive(ws) == {"type": "pong"}
        assert (await alice.http.post("/api/v1/auth/logout")).status_code == 204
        assert await _closed_with(ws) == ws_module.CLOSE_SIGNED_OUT


async def test_a_silent_client_is_disconnected(
    app: FastAPI, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch, clock: Clock
) -> None:
    """A phone app suspended in the background keeps its socket without answering; it must
    stop counting as online, and its last-seen time is kept for abandonment claims."""
    monkeypatch.setattr(presence_module, "HEARTBEAT", 0.05)
    monkeypatch.setattr(ws_module, "IDLE_SECONDS", 0.3)
    alice = await players("alice")
    state: AppState = app.state.ctx
    async with open_socket(app, alice.auth) as ws:
        await _receive(ws)
        for _ in range(4):  # pinging keeps it open well past the idle limit
            await asyncio.sleep(0.1)
            await ws.send_json({"type": "ping"})
            assert await _receive(ws) == {"type": "pong"}
        clock.advance(seconds=5)
        assert await _closed_with(ws) == ws_module.CLOSE_IDLE
    assert await state.presence.online([uuid.UUID(alice.id)]) == set()
    assert await state.presence.last_seen(uuid.UUID(alice.id)) == clock()


async def test_a_client_that_stops_reading_is_disconnected() -> None:
    conn = Connection(uuid.uuid4())
    for _ in range(OUTBOX_SIZE):
        conn.offer("x")
    assert not conn.overflowed.is_set()
    conn.offer("one too many")
    assert conn.overflowed.is_set()
    assert await ws_module._watch_overflow(conn) == ws_module.CLOSE_TOO_SLOW


async def test_presence_tracks_every_connection(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    presence = app.state.ctx.presence
    async with AsyncExitStack() as outer:
        first = await outer.enter_async_context(open_socket(app, bob.auth))
        await _receive(first)
        async with open_socket(app, bob.auth) as second:
            await _receive(second)
            assert await presence.online([uuid.UUID(bob.id)]) == {uuid.UUID(bob.id)}
        # One of two tabs closed: still online.
        assert await presence.online([uuid.UUID(bob.id)]) == {uuid.UUID(bob.id)}
    assert await presence.online([uuid.UUID(bob.id)]) == set()
    assert alice  # alice never connected
    assert await presence.count() == 0


# ── Presence and broker implementations ───────────────────────────────────


async def _presence_contract(presence: Presence, monkeypatch: pytest.MonkeyPatch) -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    assert await presence.online([]) == set()
    await presence.touch(a, "c1")
    await presence.touch(a, "c2")
    await presence.touch(b, "c1")
    assert await presence.online([a, b, uuid.uuid4()]) == {a, b}
    assert set(await presence.list_online(10)) == {a, b}
    assert len(await presence.list_online(1)) == 1
    assert await presence.count() == 2
    await presence.remove(a, "c1")
    assert await presence.online([a]) == {a}
    await presence.remove(a, "c2")
    assert await presence.online([a]) == set()
    await presence.remove(a, "never-existed")
    # Last seen, in the application's clock.
    assert await presence.last_seen(a) is None
    seen_at = datetime(2026, 1, 1, 12, 30, 15, 250_000, tzinfo=UTC)
    await presence.seen(a, seen_at)
    assert await presence.last_seen(a) == seen_at
    # Round trips, for lag compensation.
    assert await presence.round_trip_ms(b) is None
    await presence.record_round_trip(b, 87)
    assert await presence.round_trip_ms(b) == 87
    # An entry that is not refreshed lapses (a server that died without cleaning up).
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + presence_module.TTL + 1)
    assert await presence.online([b]) == set()
    assert await presence.list_online(10) == []
    assert await presence.count() == 0


async def test_memory_presence(monkeypatch: pytest.MonkeyPatch) -> None:
    await _presence_contract(MemoryPresence(), monkeypatch)


@needs_redis
async def test_redis_presence(monkeypatch: pytest.MonkeyPatch) -> None:
    assert REDIS_URL
    redis = Redis.from_url(REDIS_URL)
    try:
        await redis.delete("presence:users")
        await _presence_contract(RedisPresence(redis), monkeypatch)
    finally:
        await redis.delete("presence:users")
        await redis.aclose()


async def _hub_contract(hub_a: Hub, hub_b: Hub, settle: float) -> None:
    """Two hubs stand in for two servers; a user connected to one hears events from both."""
    user, other = uuid.uuid4(), uuid.uuid4()
    conn_a, conn_b = Connection(user), Connection(user)
    await hub_a.attach(conn_a)
    await hub_b.attach(conn_b)
    await asyncio.sleep(settle)
    await hub_b.send(user, "hello")
    await hub_a.send(other, "not for you")
    assert await asyncio.wait_for(conn_a.outbox.get(), 2) == "hello"
    assert await asyncio.wait_for(conn_b.outbox.get(), 2) == "hello"
    await hub_a.detach(conn_a)
    await hub_a.detach(conn_a)  # detaching twice is harmless
    await asyncio.sleep(settle)
    await hub_b.send(user, "again")
    assert await asyncio.wait_for(conn_b.outbox.get(), 2) == "again"
    await asyncio.sleep(settle)
    assert conn_a.outbox.empty()
    assert conn_b.outbox.empty()


async def test_memory_hub() -> None:
    hub = Hub(MemoryBroker())
    await hub.start()
    await _hub_contract(hub, hub, 0)
    await hub.stop()
    await hub.send(uuid.uuid4(), "after stop")  # ignored, not an error


@needs_redis
async def test_redis_hub_across_servers() -> None:
    assert REDIS_URL
    redis_a, redis_b = Redis.from_url(REDIS_URL), Redis.from_url(REDIS_URL)
    hub_a, hub_b = Hub(RedisBroker(redis_a)), Hub(RedisBroker(redis_b))
    await hub_a.start()
    await hub_b.start()
    try:
        await _hub_contract(hub_a, hub_b, 0.2)
        # With no users connected, each listener holds only the control channel. Traffic there
        # is ignored and does not disturb later deliveries.
        for _ in range(50):
            ((_, listeners),) = await redis_a.pubsub_numsub("rt:control")
            if listeners == 2:
                break
            await asyncio.sleep(0.1)
        await redis_a.publish("rt:control", "noise")
        late = Connection(uuid.uuid4())
        await hub_a.attach(late)
        await asyncio.sleep(0.2)
        await hub_b.send(late.user_id, "still working")
        assert await asyncio.wait_for(late.outbox.get(), 2) == "still working"
    finally:
        await hub_a.stop()
        await hub_b.stop()
        await redis_a.aclose()
        await redis_b.aclose()


async def test_stopping_a_broker_that_never_started() -> None:
    await RedisBroker(Redis.from_url("redis://127.0.0.1:1/0")).stop()


async def test_broker_keeps_retrying_while_redis_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hub_module, "RETRY_SECONDS", 0.01)
    redis = Redis.from_url("redis://127.0.0.1:1/0")
    broker = RedisBroker(redis)
    await broker.start(lambda user_id, message: None)
    await asyncio.sleep(0.1)  # several failed attempts
    assert broker._task is not None
    assert not broker._task.done()
    await broker.stop()
    await redis.aclose()


async def test_writer_stops_when_the_client_is_gone() -> None:
    class Gone:
        async def send_text(self, text: str) -> None:
            raise RuntimeError("closed")

    conn = Connection(uuid.uuid4())
    conn.offer("x")
    assert await ws_module._write(Gone(), conn) is None  # type: ignore[arg-type]
