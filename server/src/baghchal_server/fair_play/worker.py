"""Runs the fair-play checks in the background, on every server.

Each server takes queued checks one at a time (``service.claim`` makes sure no two take the
same game) and reviews them in its own worker processes, apart from the computer opponent's,
so a check never slows a game down. With nothing queued it looks again every few seconds.
"""

import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import TYPE_CHECKING, Final

import anyio
import structlog

from baghchal_engine import parse_move
from baghchal_engine.fair_play import figures
from baghchal_engine.position import Side
from baghchal_engine.review import review
from baghchal_server.fair_play import service

if TYPE_CHECKING:
    from baghchal_server.deps import AppState

log = structlog.get_logger(__name__)

IDLE_SECONDS: Final = 5.0
"""How often an idle server looks for queued checks."""
SIDES: Final = {"goat": Side.GOAT, "tiger": Side.TIGER}


def review_figures(
    moves: list[str], depth: int, seconds: float, only: str | None
) -> dict[str, dict[str, int]]:
    """Each side's figures for a game. Runs in a worker process (plain values in and out)."""
    found = figures(
        review(
            (parse_move(m) for m in moves),
            depth=depth,
            seconds=seconds,
            only=None if only is None else SIDES[only],
        )
    )
    return {name: vars(found[side]) for name, side in SIDES.items()}


class FairPlayChecker:
    """The worker processes for fair-play reviews (none: reviews run in a thread)."""

    def __init__(self, workers: int) -> None:
        self._pool = ProcessPoolExecutor(max_workers=workers) if workers else None

    async def review(
        self, moves: list[str], depth: int, seconds: float, only: str | None
    ) -> dict[str, dict[str, int]]:
        if self._pool is None:
            return await anyio.to_thread.run_sync(review_figures, moves, depth, seconds, only)
        return await asyncio.get_running_loop().run_in_executor(
            self._pool, review_figures, moves, depth, seconds, only
        )

    def stop(self) -> None:
        if self._pool is not None:
            self._pool.shutdown(cancel_futures=True)


async def check_next(state: "AppState") -> bool:
    """Check one queued game, if there is one; returns whether there was."""
    reviewer = state.fair_play.review
    async with state.sessions() as db:
        state.metrics.fair_play_skipped.inc(await service.skip_stale(db, state.clock()))
        state.metrics.fair_play_queue.set(await service.pending(db))
        game_id = await service.claim(db, state.clock())
        if game_id is None:
            return False
        try:
            players = await service.screen(db, reviewer, game_id, state.clock())

            async def heartbeat() -> None:
                await service.touch(db, game_id, state.clock())

            for user_id in players:
                if await service.evaluate(db, reviewer, user_id, state.clock(), heartbeat):
                    state.metrics.fair_play_reports.inc()
                    log.info("fair_play.reported", user_id=str(user_id))
        except Exception:
            await db.rollback()
            state.metrics.fair_play_failures.inc()
            log.exception("fair_play.failed", game_id=str(game_id))
            return True  # retried after RECLAIM_AFTER, up to MAX_ATTEMPTS
        state.metrics.fair_play_checked.inc()
        return True


async def run(state: "AppState") -> None:
    while True:
        try:
            busy = await check_next(state)
        except Exception:
            busy = False
            log.exception("fair_play.loop_failed")
        if not busy:
            await asyncio.sleep(IDLE_SECONDS)
