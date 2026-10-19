"""Exporting a player's data and deleting their account.

These reach into the lobby and games, so they live apart from the account rules.
"""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.accounts.schemas import (
    ExportAccount,
    ExportChallenge,
    ExportConsent,
    ExportGame,
    ExportNotification,
    ExportOut,
    ExportRating,
    ExportSession,
)
from baghchal_server.accounts.service import DELETED_PREFIX
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.friends import service as friends
from baghchal_server.friends.models import Friendship
from baghchal_server.games.models import Game, GameMove
from baghchal_server.games.service import active_games
from baghchal_server.legal import consents
from baghchal_server.lobby.models import Block, Challenge
from baghchal_server.lobby.service import close_open_challenges
from baghchal_server.lobby.time_controls import label_of
from baghchal_server.mail import Mail
from baghchal_server.notifications.models import Notification
from baghchal_server.ratings.models import PlayerRating

# ── Export ────────────────────────────────────────────────────────────────


def _time_control(initial_seconds: int, increment_seconds: int) -> str:
    return label_of(initial_seconds, increment_seconds)


async def export(db: AsyncSession, user: User, now: datetime) -> ExportOut:
    games = (
        await db.scalars(
            select(Game)
            .where(or_(Game.goat_id == user.id, Game.tiger_id == user.id))
            .order_by(Game.created_at, Game.id)
        )
    ).all()
    moves: dict[uuid.UUID, list[str]] = defaultdict(list)
    if games:
        for game_id, notation in await db.execute(
            select(GameMove.game_id, GameMove.notation)
            .where(GameMove.game_id.in_([g.id for g in games]))
            .order_by(GameMove.game_id, GameMove.ply)
        ):
            moves[game_id].append(notation)
    challenges = (
        await db.scalars(
            select(Challenge)
            .where(or_(Challenge.challenger_id == user.id, Challenge.opponent_id == user.id))
            .order_by(Challenge.created_at, Challenge.id)
        )
    ).all()
    blocked = (
        await db.scalars(
            select(User.username)
            .join(Block, Block.blocked_id == User.id)
            .where(Block.blocker_id == user.id)
            .order_by(User.username_key)
        )
    ).all()
    opponents = {g.tiger_id if g.goat_id == user.id else g.goat_id for g in games} | {
        c.opponent_id if c.challenger_id == user.id else c.challenger_id
        for c in challenges
        if c.opponent_id is not None
    }
    # Every opponent, deleted ones included (they show under their anonymous name).
    rows = await db.execute(select(User.id, User.username).where(User.id.in_(opponents)))
    names: dict[uuid.UUID, str] = dict(rows.all())
    ratings = (
        await db.scalars(
            select(PlayerRating)
            .where(PlayerRating.user_id == user.id)
            .order_by(PlayerRating.category)
        )
    ).all()
    sessions = (
        await db.scalars(
            select(Session)
            .where(Session.user_id == user.id, Session.expires_at > now)
            .order_by(Session.created_at, Session.token_hash)
        )
    ).all()
    return ExportOut(
        exported_at=now,
        account=ExportAccount(
            id=user.id,
            username=user.username,
            email=user.email,
            created_at=user.created_at,
            email_verified_at=user.email_verified_at,
            adult_from=user.adult_from,
            parent_email=user.parent_email,
            parent_consented_at=user.parent_consented_at,
        ),
        consents=[
            ExportConsent(document=c.document, version=c.version, accepted_at=c.accepted_at)
            for c in await consents.history(db, user.id)
        ],
        ratings=[
            ExportRating(
                category=r.category,
                rating=r.rating,
                deviation=r.deviation,
                volatility=r.volatility,
                games=r.games,
                updated_at=r.updated_at,
            )
            for r in ratings
        ],
        games=[_export_game(g, user.id, names, moves[g.id]) for g in games],
        challenges=[
            ExportChallenge(
                id=c.id,
                created_at=c.created_at,
                direction="sent" if c.challenger_id == user.id else "received",
                opponent=None
                if c.opponent_id is None
                else names[c.opponent_id if c.challenger_id == user.id else c.challenger_id],
                time_control=_time_control(c.initial_seconds, c.increment_seconds),
                rated=c.rated,
                status=c.status,
            )
            for c in challenges
        ],
        blocked_players=list(blocked),
        friends=await friends.friend_names(db, user.id),
        notifications=[
            ExportNotification(kind=n.kind, created_at=n.created_at, read_at=n.read_at)
            for n in await db.scalars(
                select(Notification)
                .where(Notification.user_id == user.id)
                .order_by(Notification.created_at)
            )
        ],
        sessions=[
            ExportSession(
                created_at=s.created_at, last_used_at=s.last_used_at, expires_at=s.expires_at
            )
            for s in sessions
        ],
    )


def _export_game(
    game: Game, user_id: uuid.UUID, names: dict[uuid.UUID, str], moves: list[str]
) -> ExportGame:
    goat = game.goat_id == user_id
    return ExportGame(
        id=game.id,
        created_at=game.created_at,
        finished_at=game.finished_at,
        time_control=_time_control(game.initial_ms // 1000, game.increment_ms // 1000),
        rated=game.rated,
        side="goat" if goat else "tiger",
        opponent=names[game.tiger_id if goat else game.goat_id],
        status=game.status,
        winner=game.winner,
        end_reason=game.end_reason,
        rating_change=game.goat_rating_change if goat else game.tiger_rating_change,
        moves=moves,
    )


# ── Deletion ──────────────────────────────────────────────────────────────


async def delete_account(
    db: AsyncSession, settings: Settings, now: datetime, user: User
) -> tuple[Sequence[Challenge], Mail]:
    """Delete a player's account; returns the challenges it closed and a goodbye mail.

    Personal data goes: email, password, a parent's email, sessions, links, blocks,
    friends. The row itself stays under a meaningless name, so the games of the players they
    met keep an opponent, and ratings stay as they were (deleted players are left out of
    leaderboards and the lobby).
    """
    if await active_games(db, user.id):
        raise AppError(
            409,
            "game_in_progress",
            "Finish or resign your live game before deleting your account.",
        )
    challenges = await close_open_challenges(db, user.id, now)
    mail = Mail(
        user.email,
        "Your ClawPlay account was deleted",
        f"Hello {user.username},\n\nYour account and your personal data have been deleted. "
        "Games you played stay in your opponents' history under an anonymous name.\n\n"
        f"You are welcome back any time at {settings.public_base_url}.",
    )
    anonymous = f"{DELETED_PREFIX}{user.id.hex[:12]}"
    user.username = user.username_key = anonymous
    user.email = user.email_key = f"{user.id.hex}@deleted.invalid"
    user.password_hash = "!"  # noqa: S105 - not a valid hash, so no password matches it
    user.parent_email = None
    user.is_active = False
    user.deleted_at = now
    user.updated_at = now
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.execute(delete(EmailToken).where(EmailToken.user_id == user.id))
    await db.execute(
        delete(Block).where(or_(Block.blocker_id == user.id, Block.blocked_id == user.id))
    )
    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    await db.execute(
        delete(Friendship).where(
            or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id)
        )
    )
    await db.commit()
    return challenges, mail
