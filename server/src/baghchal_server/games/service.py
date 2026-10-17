"""Live games: starting, moves, clocks and every way a game ends.

The server is the only authority. Each move is checked by the engine, recorded once (the
(game, ply) key), and applied with a conditional UPDATE on ``ply``, so a double-click, a second
tab or two servers can never play twice. Clocks are computed from server time only.

Clocks start after each side's first move: until then a side has ``FIRST_MOVE_GRACE`` to move,
or the game is aborted without a result. The second game of a rated match is the exception: it
cannot be aborted, and a side that does not make its first move loses on time, so nobody can
skip the side they would rather not play.
"""

import secrets
import uuid
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from baghchal_engine import Game as EngineGame
from baghchal_engine import (
    GameOver,
    IllegalMove,
    NotationError,
    Position,
    format_move,
    format_position,
    parse_move,
)
from baghchal_server.accounts.models import User
from baghchal_server.errors import AppError
from baghchal_server.games.models import (
    ActiveGame,
    EndReason,
    Game,
    GameMove,
    GameStatus,
    Match,
    MatchStatus,
)
from baghchal_server.games.schemas import (
    ClocksOut,
    GameOut,
    MatchOut,
    MatchScoreOut,
    MoveIn,
    RatingsOut,
    ResultOut,
    SideName,
    SideRatingOut,
)
from baghchal_server.lobby.models import Challenge
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.lobby.time_controls import category_of
from baghchal_server.ratings import service as ratings
from baghchal_server.realtime.presence import Presence

FIRST_MOVE_GRACE: Final = timedelta(seconds=30)
ABANDON_AFTER: Final = timedelta(seconds=60)
MAX_LAG_MS: Final = 500
"""The most network delay (the mover's measured round trip) not charged to a clock per move."""
ABORT_LIMIT: Final = 3
ABORT_WINDOW: Final = timedelta(hours=24)
ABORT_COOLDOWN: Final = timedelta(hours=1)
"""After ABORT_LIMIT aborts within ABORT_WINDOW, a player cannot start new games until
ABORT_COOLDOWN after the last one."""
SWEEP_BATCH: Final = 100
COMPUTER_TURN_OVERDUE: Final = timedelta(seconds=3)
_CACHE_SIZE: Final = 10_000
_INITIAL: Final = format_position(Position.initial())

# Engine games by game id, valid only while their ply matches the database. Replaying is
# cheap, so this is purely an optimisation and safe across servers.
_cache: OrderedDict[uuid.UUID, EngineGame] = OrderedDict()


def computer_account(level: str) -> uuid.UUID:
    """The computer's account for a level: the same id on every server and in every database."""
    return uuid.uuid5(uuid.NAMESPACE_URL, f"https://baghchal.invalid/computer/{level}")


def side_to_move(game: Game) -> SideName:
    return "goat" if game.ply % 2 == 0 else "tiger"  # goats move first


def _other(side: SideName) -> SideName:
    return "tiger" if side == "goat" else "goat"


def _side_of(game: Game, user_id: uuid.UUID) -> SideName:
    if user_id == game.goat_id:
        return "goat"
    if user_id == game.tiger_id:
        return "tiger"
    raise AppError(403, "not_a_player", "You are not playing in this game.")


def _ms(delta: timedelta) -> int:
    return int(delta.total_seconds() * 1000)


def _clocks_running(game: Game) -> bool:
    return game.status == GameStatus.ACTIVE and game.ply >= 2


def _charged_ms(game: Game, now: datetime) -> int:
    """Time taken by the side to move so far this turn, less its network delay allowance."""
    return max(0, _ms(now - game.turn_started_at) - game.lag_ms)


def clocks_at(game: Game, now: datetime) -> tuple[int, int]:
    """(goat_ms, tiger_ms) as they stand at ``now``."""
    goat, tiger = game.goat_ms, game.tiger_ms
    if _clocks_running(game):
        elapsed = _charged_ms(game, now)
        if side_to_move(game) == "goat":
            goat = max(0, goat - elapsed)
        else:
            tiger = max(0, tiger - elapsed)
    return goat, tiger


def _deadline(ply: int, turn_started_at: datetime, clock_ms: int, lag_ms: int) -> datetime:
    if ply < 2:
        return turn_started_at + FIRST_MOVE_GRACE
    return turn_started_at + timedelta(milliseconds=clock_ms + lag_ms)


async def _lag_allowance(presence: Presence, user_id: uuid.UUID, ply: int) -> int:
    """Network delay not to charge the player about to move: their measured round trip
    (requests and events each cross the network once), capped. None before clocks run."""
    if ply < 2:
        return 0
    return min(MAX_LAG_MS, await presence.round_trip_ms(user_id) or 0)


# ── Starting ──────────────────────────────────────────────────────────────


async def start_game(db: AsyncSession, challenge: Challenge, now: datetime) -> Game:
    """Create the game for an accepted challenge (caller commits). A rated challenge starts a
    two-game match; this is its first game.

    Raises IntegrityError if either player is already in a live game.
    """
    side = challenge.challenger_side
    if side is None or side == "random":
        side = secrets.choice(("goat", "tiger"))
    goat_id, tiger_id = (
        (challenge.challenger_id, challenge.opponent_id)
        if side == "goat"
        else (challenge.opponent_id, challenge.challenger_id)
    )
    match_id = None
    if challenge.rated:
        match_id = uuid.uuid4()
        db.add(
            Match(id=match_id, challenge_id=challenge.id, status=MatchStatus.ACTIVE, created_at=now)
        )
        await db.flush()
    return await _create_game(
        db,
        now,
        goat_id=goat_id,
        tiger_id=tiger_id,
        rated=challenge.rated,
        initial_ms=challenge.initial_seconds * 1000,
        increment_ms=challenge.increment_seconds * 1000,
        challenge_id=challenge.id,
        match_id=match_id,
        match_game=1 if challenge.rated else None,
    )


async def _create_game(  # noqa: PLR0913 - every field of a new game
    db: AsyncSession,
    now: datetime,
    *,
    goat_id: uuid.UUID,
    tiger_id: uuid.UUID,
    rated: bool,
    initial_ms: int,
    increment_ms: int,
    challenge_id: uuid.UUID | None,
    match_id: uuid.UUID | None,
    match_game: int | None,
    bot_level: str | None = None,
    computer_id: uuid.UUID | None = None,
) -> Game:
    category = category_of(initial_ms // 1000, increment_ms // 1000)
    current = await ratings.current(db, [goat_id, tiger_id], category, now)
    game = Game(
        id=uuid.uuid4(),
        challenge_id=challenge_id,
        match_id=match_id,
        match_game=match_game,
        goat_id=goat_id,
        tiger_id=tiger_id,
        rated=rated,
        initial_ms=initial_ms,
        increment_ms=increment_ms,
        status=GameStatus.ACTIVE,
        ply=0,
        position=_INITIAL,
        goat_ms=initial_ms,
        tiger_ms=initial_ms,
        turn_started_at=now,
        deadline_at=now + FIRST_MOVE_GRACE,
        lag_ms=0,
        goat_rating=round(current[goat_id].rating),
        tiger_rating=round(current[tiger_id].rating),
        bot_level=bot_level,
        created_at=now,
    )
    db.add(game)
    await db.flush()  # the game row first: active_games refers to it
    # One live game per person; the computer plays any number at once.
    db.add_all(
        ActiveGame(user_id=uid, game_id=game.id)
        for uid in (goat_id, tiger_id)
        if uid != computer_id
    )
    await db.flush()
    return game


async def start_computer_game(  # noqa: PLR0913 - who plays whom, which side, how fast
    db: AsyncSession,
    now: datetime,
    *,
    player_id: uuid.UUID,
    computer_id: uuid.UUID,
    level: str,
    side: str,
    initial_seconds: int,
    increment_seconds: int,
) -> Game:
    """Start a casual game between a player and the computer; ``side`` is the player's."""
    if await busy(db, [player_id]):
        raise AppError(409, "player_busy", "Finish your live game first.")
    if side == "random":
        side = secrets.choice(("goat", "tiger"))
    goat_id, tiger_id = (player_id, computer_id) if side == "goat" else (computer_id, player_id)
    try:
        game = await _create_game(
            db,
            now,
            goat_id=goat_id,
            tiger_id=tiger_id,
            rated=False,
            initial_ms=initial_seconds * 1000,
            increment_ms=increment_seconds * 1000,
            challenge_id=None,
            match_id=None,
            match_game=None,
            bot_level=level,
            computer_id=computer_id,
        )
        await db.commit()
    except IntegrityError:  # started another game at the same moment
        await db.rollback()
        raise AppError(409, "player_busy", "Finish your live game first.") from None
    return game


async def computer_turns_waiting(db: AsyncSession, now: datetime) -> list[uuid.UUID]:
    """Games against the computer where it has had the move for a few seconds: its turn was
    missed (a server restarted mid-thought, say) and should be played now."""
    rows = await db.execute(
        select(Game.id, Game.position, Game.goat_id, Game.tiger_id, Game.bot_level).where(
            Game.status == GameStatus.ACTIVE,
            Game.bot_level.is_not(None),
            Game.turn_started_at <= now - COMPUTER_TURN_OVERDUE,
        )
    )
    return [
        game_id
        for game_id, position, goat_id, tiger_id, level in rows.all()
        if (goat_id if position.split()[1] == "g" else tiger_id) == computer_account(str(level))
    ]


async def _after_finish(db: AsyncSession, game_id: uuid.UUID, now: datetime) -> None:
    """Consequences of a game ending, in the same transaction: rate it, and in a match start
    the second game (sides swapped) or close the match."""
    game = await get_game(db, game_id)
    if game.rated and game.winner is not None:
        category = category_of(game.initial_ms // 1000, game.increment_ms // 1000)
        winner_id, loser_id = (
            (game.goat_id, game.tiger_id)
            if game.winner == "goat"
            else (game.tiger_id, game.goat_id)
        )
        w_before, w_after, l_before, l_after = await ratings.record_game(
            db, category, winner_id, loser_id, now
        )
        changes = {
            winner_id: round(w_after.rating) - round(w_before.rating),
            loser_id: round(l_after.rating) - round(l_before.rating),
        }
        game.goat_rating_change = changes[game.goat_id]
        game.tiger_rating_change = changes[game.tiger_id]
    if game.match_id is None:
        return
    if game.match_game == 1 and game.end_reason != EndReason.ABORTED:
        await _create_game(
            db,
            now,
            goat_id=game.tiger_id,
            tiger_id=game.goat_id,
            rated=game.rated,
            initial_ms=game.initial_ms,
            increment_ms=game.increment_ms,
            challenge_id=None,
            match_id=game.match_id,
            match_game=2,
        )
    else:
        await db.execute(
            update(Match)
            .where(Match.id == game.match_id)
            .values(status=MatchStatus.FINISHED, finished_at=now)
        )


async def abort_cooldown(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> timedelta:
    """How long until ``user_id`` may start new games again after aborting too many (zero if
    they may now). Aborting by not making a first move counts too."""
    recent = (
        await db.scalars(
            select(Game.finished_at)
            .where(
                Game.aborted_by == user_id,
                Game.finished_at > now - ABORT_WINDOW,
                Game.bot_level.is_(None),  # leaving the computer harms nobody
            )
            .order_by(Game.finished_at.desc())
            .limit(ABORT_LIMIT)
        )
    ).all()
    if len(recent) < ABORT_LIMIT:
        return timedelta(0)
    latest = recent[0]
    assert latest is not None  # noqa: S101 - selected by finished_at > ...
    return max(timedelta(0), latest + ABORT_COOLDOWN - now)


async def last_rated_match(db: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> datetime | None:
    """When the latest rated match between two players started. A match whose first game was
    aborted never had a rated game, so it does not count."""
    first_game = aliased(Game)
    return await db.scalar(
        select(func.max(Match.created_at))
        .join(Challenge, Challenge.id == Match.challenge_id)
        .join(first_game, and_(first_game.match_id == Match.id, first_game.match_game == 1))
        .where(
            or_(
                and_(Challenge.challenger_id == a, Challenge.opponent_id == b),
                and_(Challenge.challenger_id == b, Challenge.opponent_id == a),
            ),
            or_(first_game.end_reason.is_(None), first_game.end_reason != EndReason.ABORTED),
        )
    )


async def match_games(db: AsyncSession, match_id: uuid.UUID) -> Sequence[Game]:
    return (
        await db.scalars(select(Game).where(Game.match_id == match_id).order_by(Game.match_game))
    ).all()


# ── Reading ───────────────────────────────────────────────────────────────


async def get_game(db: AsyncSession, game_id: uuid.UUID) -> Game:
    game = await db.get(Game, game_id, populate_existing=True)
    if game is None:
        raise AppError(404, "game_not_found", "No such game.")
    return game


async def active_games(db: AsyncSession, user_id: uuid.UUID) -> Sequence[Game]:
    return (
        await db.scalars(
            select(Game)
            .join(ActiveGame, ActiveGame.game_id == Game.id)
            .where(ActiveGame.user_id == user_id)
        )
    ).all()


async def busy(db: AsyncSession, user_ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """Which of these players are in a live game."""
    if not user_ids:
        return set()
    return set(await db.scalars(select(ActiveGame.user_id).where(ActiveGame.user_id.in_(user_ids))))


async def move_list(db: AsyncSession, game: Game) -> list[str]:
    """The moves up to ``game.ply``. A concurrent request may already have stored more; the
    engine game must match the row this request read, or a move is judged on a newer board."""
    return list(
        await db.scalars(
            select(GameMove.notation)
            .where(GameMove.game_id == game.id, GameMove.ply < game.ply)
            .order_by(GameMove.ply)
        )
    )


async def _engine_game(db: AsyncSession, game: Game, *, take: bool = False) -> EngineGame:
    """The engine game matching ``game``. With ``take``, it is removed from the cache, so the
    caller may change it; it goes back (via _remember) only once the change is committed.
    A cached game with ply k always equals the committed game at ply k, since committed moves
    are never rewritten."""
    cached = _cache.pop(game.id, None) if take else _cache.get(game.id)
    if cached is not None and cached.ply == game.ply:
        if not take:
            _cache.move_to_end(game.id)
        return cached
    engine_game = EngineGame.replay(parse_move(m) for m in await move_list(db, game))
    if not take:
        _remember(game.id, engine_game)
    return engine_game


def _remember(game_id: uuid.UUID, engine_game: EngineGame) -> None:
    _cache[game_id] = engine_game
    _cache.move_to_end(game_id)
    if len(_cache) > _CACHE_SIZE:
        _cache.popitem(last=False)


async def describe(db: AsyncSession, game: Game, now: datetime) -> GameOut:
    names = dict(
        (
            await db.execute(
                select(User.id, User.username).where(User.id.in_([game.goat_id, game.tiger_id]))
            )
        ).all()
    )
    engine_game = await _engine_game(db, game)
    goat_ms, tiger_ms = clocks_at(game, now)
    active = game.status == GameStatus.ACTIVE
    return GameOut(
        id=game.id,
        goat=PlayerOut(id=game.goat_id, username=names[game.goat_id]),
        tiger=PlayerOut(id=game.tiger_id, username=names[game.tiger_id]),
        time_control=f"{game.initial_ms // 60_000}+{game.increment_ms // 1000}",
        rated=game.rated,
        status=GameStatus(game.status),
        result=None if active else ResultOut(winner=game.winner, reason=EndReason(game.end_reason)),  # type: ignore[arg-type]
        position=game.position,
        ply=game.ply,
        side_to_move=side_to_move(game),
        moves=[format_move(m) for m in engine_game.moves],
        legal_moves=[format_move(m) for m in engine_game.legal_moves()] if active else [],
        clocks=ClocksOut(
            goat_ms=goat_ms,
            tiger_ms=tiger_ms,
            running=side_to_move(game) if _clocks_running(game) else None,
        ),
        ratings=RatingsOut(
            goat=SideRatingOut(rating=game.goat_rating, change=game.goat_rating_change),
            tiger=SideRatingOut(rating=game.tiger_rating, change=game.tiger_rating_change),
        ),
        match=await _describe_match(db, game, names),
        computer=game.bot_level,
        deadline_at=game.deadline_at,
        server_time=now,
        created_at=game.created_at,
        finished_at=game.finished_at,
    )


async def _describe_match(
    db: AsyncSession, game: Game, names: dict[uuid.UUID, str]
) -> MatchOut | None:
    if game.match_id is None or game.match_game is None:
        return None
    games = await match_games(db, game.match_id)
    points = dict.fromkeys((game.goat_id, game.tiger_id), 0)
    for g in games:
        if g.winner is not None:
            points[g.goat_id if g.winner == "goat" else g.tiger_id] += 1
    return MatchOut(
        id=game.match_id,
        game=game.match_game,
        games=[g.id for g in games],
        score=[
            MatchScoreOut(player=PlayerOut(id=uid, username=names[uid]), points=p)
            for uid, p in points.items()
        ],
    )


# ── Moves ─────────────────────────────────────────────────────────────────


async def play(  # noqa: PLR0913 - the move, who plays it when, and their network
    db: AsyncSession,
    game_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MoveIn,
    now: datetime,
    *,
    presence: Presence,
) -> Game:
    game = await get_game(db, game_id)
    side = _side_of(game, user_id)
    if game.status != GameStatus.ACTIVE:
        raise AppError(409, "game_over", "This game is over.")
    if data.ply != game.ply:
        raise AppError(409, "stale_position", "The game has moved on; refresh and try again.")
    if side != side_to_move(game):
        raise AppError(409, "not_your_turn", "It is not your turn.")
    if game.deadline_at is not None and now >= game.deadline_at:
        # The route settles overdue games first, so this is only a last-moment race; the
        # sweeper ends the game and tells both players.
        raise AppError(409, "game_over", "Time ran out.")
    try:
        move = parse_move(data.move)
    except NotationError:
        raise AppError(422, "invalid_move", "That is not a move.") from None

    engine_game = await _engine_game(db, game, take=True)
    try:
        outcome = engine_game.play(move)
    except (IllegalMove, GameOver):
        _remember(game.id, engine_game)  # unchanged
        raise AppError(422, "illegal_move", "That move is not allowed here.") from None

    try:
        think_ms = _charged_ms(game, now)
        clock_ms = getattr(game, f"{side}_ms")
        if game.ply >= 2:
            clock_ms = clock_ms - think_ms + game.increment_ms
        new_ply = game.ply + 1
        values: dict[str, object] = {
            "ply": new_ply,
            "position": format_position(engine_game.position),
            f"{side}_ms": clock_ms,
            "turn_started_at": now,
            "lag_ms": 0,
        }
        if outcome is None:
            next_id = game.tiger_id if side == "goat" else game.goat_id
            lag_ms = await _lag_allowance(presence, next_id, new_ply)
            values["lag_ms"] = lag_ms
            values["deadline_at"] = _deadline(
                new_ply, now, getattr(game, f"{_other(side)}_ms"), lag_ms
            )
        else:
            values.update(
                status=GameStatus.FINISHED,
                winner=outcome.winner.name.lower(),
                end_reason=EndReason(outcome.reason.value),
                deadline_at=None,
                finished_at=now,
            )
        db.add(
            GameMove(
                game_id=game.id,
                ply=game.ply,
                notation=format_move(move),
                played_at=now,
                think_ms=think_ms,
                clock_ms=clock_ms,
            )
        )
        await db.flush()
        result = await db.execute(
            update(Game)
            .where(Game.id == game.id, Game.ply == game.ply, Game.status == GameStatus.ACTIVE)
            .values(**values)
        )
        if result.rowcount != 1:  # type: ignore[attr-defined]
            raise _Stale
        if outcome is not None:
            await db.execute(delete(ActiveGame).where(ActiveGame.game_id == game.id))
            await _after_finish(db, game.id, now)
        await db.commit()
    except (IntegrityError, _Stale):
        await db.rollback()  # the engine game holds a move that did not happen; drop it
        raise AppError(
            409, "stale_position", "The game has moved on; refresh and try again."
        ) from None
    _remember(game.id, engine_game)
    return await get_game(db, game.id)


class _Stale(Exception):
    pass


# ── Ending ────────────────────────────────────────────────────────────────


async def _finish(  # noqa: PLR0913 - how the game ended, and who caused an abort
    db: AsyncSession,
    game: Game,
    now: datetime,
    winner: SideName | None,
    reason: EndReason,
    *,
    aborted_by: uuid.UUID | None = None,
) -> bool:
    """End the game as it stood at ``game.ply``; False if it changed meanwhile."""
    goat_ms, tiger_ms = clocks_at(game, now)
    if reason == EndReason.TIMEOUT:  # the flagged side has exactly nothing left
        goat_ms, tiger_ms = (0, tiger_ms) if winner == "tiger" else (goat_ms, 0)
    result = await db.execute(
        update(Game)
        .where(Game.id == game.id, Game.ply == game.ply, Game.status == GameStatus.ACTIVE)
        .values(
            status=GameStatus.FINISHED,
            winner=winner,
            end_reason=reason,
            goat_ms=goat_ms,
            tiger_ms=tiger_ms,
            deadline_at=None,
            finished_at=now,
            aborted_by=aborted_by,
        )
    )
    if result.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        return False
    await db.execute(delete(ActiveGame).where(ActiveGame.game_id == game.id))
    await _after_finish(db, game.id, now)
    await db.commit()
    return True


Decide = Callable[[Game, SideName], Awaitable[tuple[SideName | None, EndReason]]]


async def _end_by_player(
    db: AsyncSession, game_id: uuid.UUID, user_id: uuid.UUID, now: datetime, decide: Decide
) -> Game:
    """End a game at a player's request; ``decide`` gives (winner, reason) or raises."""
    # A move may land between reading the game and ending it; read again and re-decide.
    for _ in range(3):
        game = await get_game(db, game_id)
        side = _side_of(game, user_id)
        if game.status != GameStatus.ACTIVE:
            raise AppError(409, "game_over", "This game is over.")
        winner, reason = await decide(game, side)
        aborted_by = user_id if reason == EndReason.ABORTED else None
        if await _finish(db, game, now, winner, reason, aborted_by=aborted_by):
            return await get_game(db, game_id)
    raise AppError(409, "stale_position", "The game is changing quickly; try again.")


async def resign(db: AsyncSession, game_id: uuid.UUID, user_id: uuid.UUID, now: datetime) -> Game:
    async def decide(game: Game, side: SideName) -> tuple[SideName | None, EndReason]:
        return _other(side), EndReason.RESIGNED

    return await _end_by_player(db, game_id, user_id, now, decide)


async def abort(db: AsyncSession, game_id: uuid.UUID, user_id: uuid.UUID, now: datetime) -> Game:
    async def decide(game: Game, side: SideName) -> tuple[SideName | None, EndReason]:
        if game.match_game == 2:
            raise AppError(
                409, "cannot_abort", "The second game of a rated match cannot be aborted."
            )
        if game.ply >= 2:
            raise AppError(409, "cannot_abort", "Games can only be aborted before both sides move.")
        return None, EndReason.ABORTED

    return await _end_by_player(db, game_id, user_id, now, decide)


async def claim_abandonment(
    db: AsyncSession, presence: Presence, game_id: uuid.UUID, user_id: uuid.UUID, now: datetime
) -> Game:
    """Win a game whose opponent has been away for ABANDON_AFTER on their own turn: their turn
    has lasted that long, and they have not been connected at all for that long either (a
    connection that blinks off and on again does not count as leaving)."""

    async def decide(game: Game, side: SideName) -> tuple[SideName | None, EndReason]:
        opponent_id = game.tiger_id if side == "goat" else game.goat_id
        last_seen = await presence.last_seen(opponent_id)
        if (
            game.ply < 2
            or side_to_move(game) == side
            or now - game.turn_started_at < ABANDON_AFTER
            or await presence.online([opponent_id])
            or (last_seen is not None and now - last_seen < ABANDON_AFTER)
        ):
            raise AppError(
                409,
                "cannot_claim",
                "You can claim the game once your opponent has been offline for "
                f"{int(ABANDON_AFTER.total_seconds())} seconds on their turn.",
            )
        return side, EndReason.ABANDONED

    return await _end_by_player(db, game_id, user_id, now, decide)


async def expire(db: AsyncSession, game: Game, now: datetime) -> bool:
    """End a game whose deadline has passed: aborted before both moved (except in the second
    game of a match, which cannot be aborted), else a timeout loss."""
    if game.ply < 2 and game.match_game != 2:
        late = game.goat_id if side_to_move(game) == "goat" else game.tiger_id
        return await _finish(db, game, now, None, EndReason.ABORTED, aborted_by=late)
    return await _finish(db, game, now, _other(side_to_move(game)), EndReason.TIMEOUT)


async def due_games(db: AsyncSession, now: datetime) -> Sequence[uuid.UUID]:
    return (
        await db.scalars(
            select(Game.id)
            .where(Game.status == GameStatus.ACTIVE, Game.deadline_at <= now)
            .limit(SWEEP_BATCH)
        )
    ).all()
