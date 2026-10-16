"""Ends games whose side to move has run out of time, on every server.

Each server sweeps; the conditional UPDATE in ``service.expire`` makes sure a game is ended
exactly once however many servers see it at the same moment.
"""

import asyncio
from typing import Final

import structlog

from baghchal_server.deps import AppState
from baghchal_server.games import service
from baghchal_server.games.events import notify
from baghchal_server.games.models import GameStatus

log = structlog.get_logger(__name__)

SWEEP_INTERVAL: Final = 0.5


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


async def run(state: AppState) -> None:
    while True:
        try:
            await sweep(state)
        except Exception:
            log.exception("sweeper.failed")
        await asyncio.sleep(SWEEP_INTERVAL)
