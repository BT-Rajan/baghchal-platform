"""Who is online.

Each open connection refreshes its entry every ``HEARTBEAT`` seconds and entries lapse after
``TTL`` seconds, so a server that dies without cleaning up stops showing its users as online
within ``TTL``. A user is online while any of their connections is.

Presence also remembers when each user was last seen connected (``seen`` / ``last_seen``, in
the application's clock), so the server can tell a player who has been gone for a while from
one whose connection just blinked.
"""

import time
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Final, Protocol

from redis.asyncio import Redis

HEARTBEAT: Final = 15.0
TTL: Final = 45.0
SEEN_TTL: Final = 7 * 24 * 3600
"""How long a last-seen time is kept (seconds)."""
ROUND_TRIP_TTL: Final = 120
"""A measured round trip older than this (seconds) is forgotten: the network may have changed."""


class Presence(Protocol):
    async def touch(self, user_id: uuid.UUID, conn_id: str) -> None: ...
    async def remove(self, user_id: uuid.UUID, conn_id: str) -> None: ...
    async def online(self, user_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]: ...
    async def list_online(self, limit: int) -> list[uuid.UUID]: ...
    async def count(self) -> int: ...
    async def seen(self, user_id: uuid.UUID, at: datetime) -> None: ...
    async def last_seen(self, user_id: uuid.UUID) -> datetime | None: ...
    async def record_round_trip(self, user_id: uuid.UUID, ms: int) -> None: ...
    async def round_trip_ms(self, user_id: uuid.UUID) -> int | None: ...


class MemoryPresence:
    """For a single server process (development and tests)."""

    def __init__(self) -> None:
        self._conns: dict[uuid.UUID, dict[str, float]] = {}
        self._seen: dict[uuid.UUID, datetime] = {}
        self._round_trips: dict[uuid.UUID, tuple[int, float]] = {}

    def _live(self, user_id: uuid.UUID, now: float) -> bool:
        conns = self._conns.get(user_id)
        if conns is None:
            return False
        for conn_id, expiry in list(conns.items()):
            if expiry <= now:
                del conns[conn_id]
        if not conns:
            del self._conns[user_id]
            return False
        return True

    async def touch(self, user_id: uuid.UUID, conn_id: str) -> None:
        self._conns.setdefault(user_id, {})[conn_id] = time.time() + TTL

    async def remove(self, user_id: uuid.UUID, conn_id: str) -> None:
        self._conns.get(user_id, {}).pop(conn_id, None)
        self._live(user_id, time.time())

    async def online(self, user_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
        now = time.time()
        return {u for u in user_ids if self._live(u, now)}

    async def list_online(self, limit: int) -> list[uuid.UUID]:
        now = time.time()
        return [u for u in list(self._conns) if self._live(u, now)][:limit]

    async def count(self) -> int:
        now = time.time()
        return sum(1 for u in list(self._conns) if self._live(u, now))

    async def seen(self, user_id: uuid.UUID, at: datetime) -> None:
        self._seen[user_id] = at

    async def last_seen(self, user_id: uuid.UUID) -> datetime | None:
        return self._seen.get(user_id)

    async def record_round_trip(self, user_id: uuid.UUID, ms: int) -> None:
        self._round_trips[user_id] = (ms, time.time() + ROUND_TRIP_TTL)

    async def round_trip_ms(self, user_id: uuid.UUID) -> int | None:
        ms, expiry = self._round_trips.get(user_id, (None, 0.0))
        return ms if expiry > time.time() else None


# Keys: presence:users is a sorted set of user ids scored by when they lapse;
# presence:u:<id> is a sorted set of that user's connection ids scored the same way.
_USERS: Final = "presence:users"

_TOUCH = """
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('ZADD', KEYS[1], 'GT', ARGV[2], ARGV[3])  -- GT still adds a missing member
if math.random() < 0.01 then
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', '(' .. ARGV[5])
end
"""

_REMOVE = """
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
local last = redis.call('ZRANGE', KEYS[2], -1, -1, 'WITHSCORES')
if #last == 0 then
  redis.call('ZREM', KEYS[1], ARGV[3])
else
  redis.call('ZADD', KEYS[1], last[2], ARGV[3])
end
"""


class RedisPresence:
    """Shared by every server process."""

    def __init__(self, redis: "Redis") -> None:
        self._redis = redis
        self._touch = redis.register_script(_TOUCH)
        self._remove = redis.register_script(_REMOVE)

    async def touch(self, user_id: uuid.UUID, conn_id: str) -> None:
        now = time.time()
        uid = str(user_id)
        await self._touch(
            keys=[_USERS, f"presence:u:{uid}"],
            args=[conn_id, now + TTL, uid, int(TTL) + 1, now],
        )

    async def remove(self, user_id: uuid.UUID, conn_id: str) -> None:
        uid = str(user_id)
        await self._remove(keys=[_USERS, f"presence:u:{uid}"], args=[conn_id, time.time(), uid])

    async def online(self, user_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
        ids = list(user_ids)
        if not ids:
            return set()
        scores = await self._redis.zmscore(_USERS, [str(u) for u in ids])
        now = time.time()
        return {u for u, s in zip(ids, scores, strict=True) if s is not None and s > now}

    async def list_online(self, limit: int) -> list[uuid.UUID]:
        raw = await self._redis.zrangebyscore(_USERS, f"({time.time()}", "+inf", start=0, num=limit)
        return [uuid.UUID(r.decode() if isinstance(r, bytes) else str(r)) for r in raw]

    async def count(self) -> int:
        return int(await self._redis.zcount(_USERS, f"({time.time()}", "+inf"))

    async def seen(self, user_id: uuid.UUID, at: datetime) -> None:
        await self._redis.set(f"presence:seen:{user_id}", str(at.timestamp()), ex=SEEN_TTL)

    async def last_seen(self, user_id: uuid.UUID) -> datetime | None:
        raw = await self._redis.get(f"presence:seen:{user_id}")
        return None if raw is None else datetime.fromtimestamp(float(raw), UTC)

    async def record_round_trip(self, user_id: uuid.UUID, ms: int) -> None:
        await self._redis.set(f"presence:rtt:{user_id}", str(ms), ex=ROUND_TRIP_TTL)

    async def round_trip_ms(self, user_id: uuid.UUID) -> int | None:
        raw = await self._redis.get(f"presence:rtt:{user_id}")
        return None if raw is None else int(raw)
