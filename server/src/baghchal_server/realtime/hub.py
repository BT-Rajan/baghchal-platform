"""Delivering events to a user's open connections, on whichever server they are connected.

Every event for a user goes through a broker. With Redis, each server subscribes to the
channels of the users connected to it, so an event published anywhere reaches every one of the
user's tabs and devices. Without Redis (one process), the broker delivers directly.

Each connection has a bounded outbox. A client that stops reading is disconnected rather than
allowed to make the server buffer without limit.
"""

import asyncio
import contextlib
import time
import uuid
from collections.abc import Callable
from typing import Final, Protocol

import structlog
from redis.asyncio import Redis
from redis.asyncio.client import PubSub

log = structlog.get_logger(__name__)

OUTBOX_SIZE: Final = 64
RETRY_SECONDS = 1.0
Deliver = Callable[[uuid.UUID, str], None]


class Connection:
    """One open WebSocket: what the hub needs to know about it."""

    def __init__(self, user_id: uuid.UUID) -> None:
        self.id = uuid.uuid4().hex
        self.user_id = user_id
        self.outbox: asyncio.Queue[str] = asyncio.Queue(OUTBOX_SIZE)
        self.overflowed = asyncio.Event()
        self.last_heard = time.monotonic()
        """When the client last sent anything (clients ping every 25 seconds)."""

    def offer(self, message: str) -> None:
        try:
            self.outbox.put_nowait(message)
        except asyncio.QueueFull:
            self.overflowed.set()


class Broker(Protocol):
    async def start(self, deliver: Deliver) -> None: ...
    async def stop(self) -> None: ...
    async def publish(self, user_id: uuid.UUID, message: str) -> None: ...
    async def subscribe(self, user_id: uuid.UUID) -> None: ...
    async def unsubscribe(self, user_id: uuid.UUID) -> None: ...


class MemoryBroker:
    def __init__(self) -> None:
        self._deliver: Deliver | None = None

    async def start(self, deliver: Deliver) -> None:
        self._deliver = deliver

    async def stop(self) -> None:
        self._deliver = None

    async def publish(self, user_id: uuid.UUID, message: str) -> None:
        if self._deliver is not None:
            self._deliver(user_id, message)

    async def subscribe(self, user_id: uuid.UUID) -> None:
        pass

    async def unsubscribe(self, user_id: uuid.UUID) -> None:
        pass


_CONTROL: Final = "rt:control"  # keeps the subscription alive while no user is connected


def _channel(user_id: uuid.UUID) -> str:
    return f"rt:u:{user_id}"


class RedisBroker:
    def __init__(self, redis: "Redis") -> None:
        self._redis = redis
        self._pubsub: PubSub | None = None
        self._task: asyncio.Task[None] | None = None
        # The first (un)subscribe opens the Pub/Sub connection; two at once would each open
        # one, and messages on the overwritten connection would be lost.
        self._lock = asyncio.Lock()

    async def start(self, deliver: Deliver) -> None:
        # Connecting happens in the background task, so the server starts (and reports
        # Redis as failing in readiness) even while Redis is unreachable.
        self._pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
        self._task = asyncio.create_task(self._listen(self._pubsub, self._lock, deliver))

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._pubsub is not None:
            await self._pubsub.aclose()  # type: ignore[no-untyped-call]

    async def publish(self, user_id: uuid.UUID, message: str) -> None:
        await self._redis.publish(_channel(user_id), message)

    async def subscribe(self, user_id: uuid.UUID) -> None:
        assert self._pubsub is not None  # noqa: S101 - start() runs at startup
        async with self._lock:
            await self._pubsub.subscribe(_channel(user_id))

    async def unsubscribe(self, user_id: uuid.UUID) -> None:
        assert self._pubsub is not None  # noqa: S101
        async with self._lock:
            await self._pubsub.unsubscribe(_channel(user_id))

    @staticmethod
    async def _listen(pubsub: PubSub, lock: asyncio.Lock, deliver: Deliver) -> None:
        while True:
            try:
                if not pubsub.subscribed:
                    async with lock:
                        await pubsub.subscribe(_CONTROL)
                message = await pubsub.get_message(timeout=1.0)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("broker.receive_failed")
                await asyncio.sleep(RETRY_SECONDS)
                continue
            if message is None or message["type"] != "message":
                continue
            channel = message["channel"]
            channel = channel.decode() if isinstance(channel, bytes) else channel
            if not channel.startswith("rt:u:"):
                continue
            data = message["data"]
            deliver(uuid.UUID(channel[5:]), data.decode() if isinstance(data, bytes) else data)


class Hub:
    """The connections open on this server, and event delivery to them."""

    def __init__(self, broker: Broker) -> None:
        self._broker = broker
        self._local: dict[uuid.UUID, set[Connection]] = {}

    async def start(self) -> None:
        await self._broker.start(self._deliver_local)

    async def stop(self) -> None:
        await self._broker.stop()

    async def attach(self, conn: Connection) -> None:
        conns = self._local.setdefault(conn.user_id, set())
        conns.add(conn)
        if len(conns) == 1:
            await self._broker.subscribe(conn.user_id)

    async def detach(self, conn: Connection) -> None:
        conns = self._local.get(conn.user_id)
        if conns is None:
            return
        conns.discard(conn)
        if not conns:
            del self._local[conn.user_id]
            await self._broker.unsubscribe(conn.user_id)

    async def send(self, user_id: uuid.UUID, message: str) -> None:
        """Deliver ``message`` to every connection the user has, on any server."""
        await self._broker.publish(user_id, message)

    def _deliver_local(self, user_id: uuid.UUID, message: str) -> None:
        for conn in self._local.get(user_id, ()):
            conn.offer(message)
