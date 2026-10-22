"""Games against the computer.

The computer plays as one of three accounts (``computer-easy``, ``-medium``, ``-hard``),
created the first time they are needed. They never sign in, cannot be found, challenged or
reported, and their games are casual.

When it is the computer's turn, the server that saw the last move (or the one sweeping, if a
turn has been waiting a few seconds, for example after a restart) asks the engine for a move.
The search runs in a separate process, so a long think never slows the API down, and the
move is played through the same path as a player's, after a pause so it feels human: how long
depends on the level, how far into the game it is and a little luck (see ``human_pause``).
"""

import asyncio
import random
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from typing import TYPE_CHECKING, Final

import anyio
import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_engine import Game as EngineGame
from baghchal_engine import format_move, parse_move
from baghchal_engine.ai import Level, choose_move
from baghchal_engine.position import Side
from baghchal_engine.review import review
from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import BOT_ROLE, COMPUTER_PREFIX
from baghchal_server.errors import AppError
from baghchal_server.games import service
from baghchal_server.games.events import notify
from baghchal_server.games.models import GameStatus
from baghchal_server.games.schemas import MoveIn

if TYPE_CHECKING:
    from baghchal_server.deps import AppState

log = structlog.get_logger(__name__)

THINK_SECONDS: Final[dict[Level, tuple[float, float]]] = {
    Level.EASY: (1.5, 4.0),
    Level.MEDIUM: (2.5, 6.0),
    Level.HARD: (3.0, 8.0),
}
"""The shortest and longest the computer waits before moving, per level, so its moves do not
land at once. Stronger levels "think" longer, as a stronger player would."""

OPENING_PLIES: Final = 4
OPENING_SPEED: Final = 0.6
"""The first moves of a game are quicker (people play their openings fast)."""

SNAP_CHANCE: Final = 0.15
SNAP_SPEED: Final = 0.4
"""Now and then a person replies almost at once; so does the computer."""

CLOCK_SHARE: Final = 0.1
"""The most of its remaining clock the computer spends pretending to think on one move, so a
short game is never lost to the pause."""


def human_pause(
    level: Level,
    ply: int,
    remaining_ms: int | None = None,
    override: tuple[float, float] | None = None,
) -> float:
    """Seconds the computer should take over a move, counted from when it was asked.

    Skewed towards the shorter end with the odd long think, quicker in the opening and now and
    then a snap reply, never more than ``CLOCK_SHARE`` of the time it has left. ``override`` (a
    fixed range) replaces the level's range, for tests.
    """
    low, high = override if override is not None else THINK_SECONDS[level]
    if high <= low:
        pause = low
    else:
        pause = random.triangular(low, high, low + 0.3 * (high - low))  # noqa: S311
        if ply < OPENING_PLIES:
            pause *= OPENING_SPEED
        elif random.random() < SNAP_CHANCE:  # noqa: S311
            pause *= SNAP_SPEED
    if override is None and remaining_ms is not None:
        pause = min(pause, remaining_ms / 1000 * CLOCK_SHARE)
    return max(0.0, pause)


def username(level: Level) -> str:
    return f"{COMPUTER_PREFIX}-{level}"


async def account(db: AsyncSession, level: Level, now: datetime) -> User:
    """The computer's account for ``level``, created on first use."""
    user = await db.get(User, service.computer_account(level))
    if user is not None:
        return user
    name = username(level)
    db.add(
        User(
            id=service.computer_account(level),
            username=name,
            username_key=name,
            email=f"{name}@computer.invalid",
            email_key=f"{name}@computer.invalid",
            password_hash="!",  # noqa: S106 - not a valid hash: it can never sign in
            email_verified_at=now,
            is_active=True,
            role=BOT_ROLE,
            created_at=now,
            updated_at=now,
        )
    )
    try:
        await db.commit()
    except IntegrityError:  # another request created it at the same moment
        await db.rollback()
    user = await db.get(User, service.computer_account(level))
    assert user is not None  # noqa: S101 - just created
    return user


def think(moves: list[str], level: str) -> str:
    """The engine's move after ``moves``. Runs in a worker process (so it is a plain
    function of plain values)."""
    game = EngineGame.replay(parse_move(m) for m in moves)
    return format_move(choose_move(game, Level(level)))


def review_game(moves: list[str]) -> list[dict[str, object]]:
    """The engine's review of a finished game, move by move. Runs in a worker process."""
    return [
        {
            "ply": r.ply,
            "side": "goat" if r.side is Side.GOAT else "tiger",
            "move": r.move,
            "best": r.best,
            "loss": r.loss,
            "verdict": r.verdict.value,
            "score": r.score,
        }
        for r in review(parse_move(m) for m in moves)
    ]


class ComputerPlayers:
    """Plays the computer's turns in the background, one at a time per game."""

    def __init__(self, workers: int) -> None:
        self.think_seconds: tuple[float, float] | None = None
        """A fixed (shortest, longest) pause for every level; None for the human-like default.
        Tests set it."""
        self._pool = ProcessPoolExecutor(max_workers=workers) if workers else None
        self._tasks: set[asyncio.Task[None]] = set()
        self._games: set[uuid.UUID] = set()

    def schedule(self, state: "AppState", game_id: uuid.UUID) -> None:
        """Play the computer's move in ``game_id`` soon, if it is its turn."""
        if game_id in self._games:
            return
        self._games.add(game_id)
        task = asyncio.create_task(self._turn(state, game_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def stop(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        if self._pool is not None:
            self._pool.shutdown(cancel_futures=True)

    async def _turn(self, state: "AppState", game_id: uuid.UUID) -> None:
        try:
            await self.play_turn(state, game_id)
        except Exception:
            log.exception("computer.failed", game_id=str(game_id))
        finally:
            self._games.discard(game_id)

    async def _search(self, moves: list[str], level: Level) -> str:
        if self._pool is None:
            return await anyio.to_thread.run_sync(think, moves, level.value)
        return await asyncio.get_running_loop().run_in_executor(
            self._pool, think, moves, level.value
        )

    async def review(self, moves: list[str]) -> list[dict[str, object]]:
        """Review a finished game in a worker, away from the event loop."""
        if self._pool is None:
            return await anyio.to_thread.run_sync(review_game, moves)
        return await asyncio.get_running_loop().run_in_executor(self._pool, review_game, moves)

    async def play_turn(self, state: "AppState", game_id: uuid.UUID) -> bool:
        """Play the computer's move if it is its turn; True when a move was played."""
        async with state.sessions() as db:
            game = await service.get_game(db, game_id)
            if game.status != GameStatus.ACTIVE or game.bot_level is None:
                return False
            level = Level(game.bot_level)
            mover = game.goat_id if service.side_to_move(game) == "goat" else game.tiger_id
            if mover != service.computer_account(level):
                return False
            moves = await service.move_list(db, game)
            ply, position = game.ply, game.position
            remaining_ms = min(service.clocks_at(game, state.clock()))
        started = time.monotonic()
        move = await self._search(moves, level)
        pause = human_pause(level, ply, remaining_ms, self.think_seconds) - (
            time.monotonic() - started
        )
        if pause > 0:
            await asyncio.sleep(pause)
        async with state.sessions() as db:
            try:
                played = await service.play(
                    db,
                    game_id,
                    mover,
                    MoveIn(ply=ply, move=move),
                    state.clock(),
                    presence=state.presence,
                    position=position,
                )
            except AppError:
                # The player resigned or ran out of time meanwhile, or took a move back (and
                # may have played again, so it is the computer's turn on another board).
                game = await service.get_game(db, game_id)
                if game.status == GameStatus.ACTIVE and (game.ply, game.position) != (
                    ply,
                    position,
                ):
                    return await self.play_turn(state, game_id)
                return False
            await notify(state, db, played)
        return True
