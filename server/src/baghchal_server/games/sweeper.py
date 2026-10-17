"""Ends games whose side to move has run out of time.

With Redis, one server at a time holds a short lease and does the sweeping, so the database
sees the same few queries a second however many servers run; if that server stops, another
takes over within ``LEASE_MS``. Without Redis (one server) it always sweeps. Either way the
conditional UPDATE in ``service.expire`` ends a game exactly once, even if two servers overlap.
"""

import asyncio
import uuid
from typing import TYPE_CHECKING, Final

import structlog

from baghchal_server.deps import AppState
from baghchal_server.games import service
from baghchal_server.games.events import notify
from baghchal_server.games.models import GameStatus

log = structlog.get_logger(__name__)

SWEEP_INTERVAL: Final = 0.5
LEASE_KEY: Final = "sweeper:lease"
LEASE_MS: Final = 3000
"""How long a server keeps the lease without renewing it (it renews every sweep)."""

# Take the lease if it is free, or renew it if we hold it; 1 when we may sweep.
_LEASE_SCRIPT: Final = """
local holder = redis.call('GET', KEYS[1])
if holder == ARGV[1] then
    redis.call('PEXPIRE', KEYS[1], ARGV[2])
    return 1
end
if holder then
    return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1
"""

if TYPE_CHECKING:
    from redis.asyncio import Redis


async def sweep(state: AppState) -> int:
    """End every overdue game; returns how many this call ended."""
    now = state.clock()
    ended = 0
    async with state.sessions() as db:
        for game_id in await service.due_games(db, now):
            game = await service.get_game(db, game_id)
            if (
                game.status != GameStatus.ACTIVE
                or game.deadline_at is None
                or game.deadline_at > now
            ):
                continue  # another server or a last-moment move got there first
            if await service.expire(db, game, now):
                await notify(state, db, await service.get_game(db, game_id))
                ended += 1
    return ended


async def holds_lease(redis: "Redis | None", server_id: str) -> bool:
    """Whether this server should sweep now (taking or renewing the lease)."""
    if redis is None:
        return True
    taken = await redis.eval(_LEASE_SCRIPT, 1, LEASE_KEY, server_id, str(LEASE_MS))
    return bool(taken)


async def run(state: AppState) -> None:
    server_id = uuid.uuid4().hex
    while True:
        try:
            if await holds_lease(state.redis, server_id):
                state.metrics.expired.inc(await sweep(state))
                state.metrics.sweeps.inc()
        except Exception:
            state.metrics.sweep_failures.inc()
            log.exception("sweeper.failed")
        await asyncio.sleep(SWEEP_INTERVAL)
