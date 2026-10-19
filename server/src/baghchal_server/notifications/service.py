"""Recording notifications and reading them back. Each player keeps the newest ``KEEP``; a
live ``notification`` event tells them at once, so the app can update its count."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Final

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.notifications.models import Notification
from baghchal_server.notifications.schemas import (
    NotificationKind,
    NotificationList,
    NotificationOut,
    TournamentRef,
)
from baghchal_server.realtime.protocol import NotificationEvent
from baghchal_server.tournaments.models import Tournament

if TYPE_CHECKING:
    from baghchal_server.deps import AppState

KEEP: Final = 100
SHOWN: Final = 50


async def notify(  # noqa: PLR0913 - who, what, by whom, which
    state: "AppState",
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: NotificationKind,
    *,
    actor_id: uuid.UUID | None = None,
    ref: str | None = None,
) -> None:
    """Record a notification for ``user_id`` and tell them at once. It replaces an earlier one
    saying the same (same kind, by the same player, about the same thing), so asking again
    shows once, as the latest."""
    await db.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.kind == kind,
            Notification.actor_id == actor_id
            if actor_id is not None
            else Notification.actor_id.is_(None),
            Notification.ref == ref if ref is not None else Notification.ref.is_(None),
        )
    )
    db.add(
        Notification(
            user_id=user_id, kind=kind, actor_id=actor_id, ref=ref, created_at=state.clock()
        )
    )
    await db.flush()
    # Only the newest KEEP are kept.
    oldest_kept = await db.scalar(
        select(Notification.created_at)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(KEEP - 1)
        .limit(1)
    )
    if oldest_kept is not None:
        await db.execute(
            delete(Notification).where(
                Notification.user_id == user_id, Notification.created_at < oldest_kept
            )
        )
    await db.commit()
    await state.hub.send(user_id, NotificationEvent().model_dump_json())


async def mine(db: AsyncSession, user_id: uuid.UUID) -> NotificationList:
    rows = (
        await db.scalars(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc(), Notification.id)
            .limit(SHOWN)
        )
    ).all()
    actors = {r.actor_id for r in rows if r.actor_id is not None}
    names = dict(
        (await db.execute(select(User.id, User.username).where(User.id.in_(actors)))).all()
    )
    codes = {
        r.ref for r in rows if r.kind == NotificationKind.TOURNAMENT_STARTED and r.ref is not None
    }
    tournaments = dict(
        (
            await db.execute(
                select(Tournament.code, Tournament.name).where(Tournament.code.in_(codes))
            )
        ).all()
    )
    unread = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    items = []
    for r in rows:
        tournament = None
        if r.kind == NotificationKind.TOURNAMENT_STARTED:
            if r.ref not in tournaments:
                continue  # the tournament is gone
            tournament = TournamentRef(code=r.ref, name=tournaments[r.ref])
        items.append(
            NotificationOut(
                id=r.id,
                kind=NotificationKind(r.kind),
                actor=PlayerOut(id=r.actor_id, username=names[r.actor_id])
                if r.actor_id in names
                else None,
                detail=r.ref if r.kind == NotificationKind.CHALLENGE else None,
                tournament=tournament,
                created_at=r.created_at,
                read=r.read_at is not None,
            )
        )
    return NotificationList(unread=unread or 0, items=items)


async def read_all(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=now)
    )
    await db.commit()
