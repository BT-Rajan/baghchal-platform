"""Fixed-window rate limiting, in memory (one process) or in Redis (shared by all servers)."""

import math
import time
from dataclasses import dataclass
from typing import Protocol

from redis.asyncio import Redis


@dataclass(frozen=True, slots=True)
class Limit:
    name: str
    count: int
    seconds: int


class RateLimiter(Protocol):
    async def hit(self, limit: Limit, key: str) -> int:
        """Count one attempt; return 0 if allowed, else seconds until the window resets."""
        ...

    async def undo(self, limit: Limit, key: str, counted_at: float) -> None:
        """Take back one attempt counted at ``counted_at`` (a ``time.time()`` taken just before
        ``hit``): one counted in advance that turned out not to be the kind this limit is about.
        Only that attempt's window is touched, so a refund never frees room in a later one."""
        ...


def _retry_after(limit: Limit, window: int, now: float) -> int:
    return max(1, math.ceil((window + 1) * limit.seconds - now))


class MemoryRateLimiter:
    """For development and tests. Holds at most ``max_keys`` windows, dropping the oldest."""

    def __init__(self, max_keys: int = 100_000) -> None:
        self._windows: dict[str, tuple[int, int]] = {}
        self._max_keys = max_keys

    async def hit(self, limit: Limit, key: str) -> int:
        now = time.time()
        window = int(now // limit.seconds)
        full_key = f"{limit.name}:{key}"
        start, count = self._windows.pop(full_key, (window, 0))
        if start != window:
            start, count = window, 0
        count += 1
        self._windows[full_key] = (start, count)  # re-inserted, so dict order is by recency
        if len(self._windows) > self._max_keys:
            del self._windows[next(iter(self._windows))]
        if count <= limit.count:
            return 0
        return _retry_after(limit, window, now)

    async def undo(self, limit: Limit, key: str, counted_at: float) -> None:
        window = int(counted_at // limit.seconds)
        full_key = f"{limit.name}:{key}"
        start, count = self._windows.get(full_key, (window, 0))
        if start == window and count > 0:
            self._windows[full_key] = (start, count - 1)


_UNDO = """
if (tonumber(redis.call('GET', KEYS[1]) or '0')) > 0 then
  redis.call('DECR', KEYS[1])
end
"""


class RedisRateLimiter:
    def __init__(self, redis: "Redis") -> None:
        self._redis = redis
        self._undo = redis.register_script(_UNDO)

    async def hit(self, limit: Limit, key: str) -> int:
        now = time.time()
        window = int(now // limit.seconds)
        redis_key = f"rl:{limit.name}:{window}:{key}"
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.incr(redis_key)
            pipe.expire(redis_key, limit.seconds + 1)
            count, _ = await pipe.execute()
        if int(count) <= limit.count:
            return 0
        return _retry_after(limit, window, now)

    async def undo(self, limit: Limit, key: str, counted_at: float) -> None:
        window = int(counted_at // limit.seconds)
        await self._undo(keys=[f"rl:{limit.name}:{window}:{key}"])
