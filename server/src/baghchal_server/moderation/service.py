"""Reports from players, and what moderators do about them.

Every moderator action is written to the moderation log with its reason. Moderators cannot act
on themselves or on other moderators; roles are granted from the command line only.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import Session, User
from baghchal_server.accounts.service import (
    MODERATOR,
    PERMANENT,
    is_suspended,
    username_allowed,
    username_key,
)
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.games.models import Game
from baghchal_server.lobby.models import Challenge
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.lobby.service import close_open_challenges, find_player
from baghchal_server.mail import Mail
from baghchal_server.moderation.models import (
    ActionKind,
    ModerationAction,
    Report,
    ReportReason,
    ReportStatus,
)
from baghchal_server.moderation.schemas import (
    ModActionOut,
    ModPlayerOut,
    ReportIn,
    ReportOut,
    ReportTargetOut,
)

RECORD_REPORTS: Final = 50
"""Reports and actions shown on a player's moderation record."""

# ── Reporting ─────────────────────────────────────────────────────────────


async def report(
    db: AsyncSession, now: datetime, reporter: User, target_name: str, data: ReportIn
) -> None:
    """File a report. Reporting the same player again while the first report is open keeps the
    first one, so one person cannot pile up reports."""
    target = await find_player(db, target_name, now)
    if target is None:
        raise AppError(404, "player_not_found", "No such player.")
    if target.id == reporter.id:
        raise AppError(422, "cannot_report_self", "You cannot report yourself.")
    if data.game_id is not None:
        game = await db.get(Game, data.game_id)
        if game is None or {game.goat_id, game.tiger_id} != {reporter.id, target.id}:
            raise AppError(
                422, "invalid_game", f"That game is not one between you and {target.username}."
            )
    open_key = f"{reporter.id}:{target.id}"
    if await has_open_report(db, open_key):
        return
    db.add(
        Report(
            reporter_id=reporter.id,
            target_id=target.id,
            game_id=data.game_id,
            reason=data.reason,
            details=data.details,
            status=ReportStatus.OPEN,
            open_key=open_key,
            created_at=now,
        )
    )
    try:
        await db.commit()
    except IntegrityError:  # the same report sent twice at once: one is enough
        await db.rollback()


async def has_open_report(db: AsyncSession, open_key: str) -> bool:
    return await db.scalar(select(Report.id).where(Report.open_key == open_key)) is not None


# ── The report queue ──────────────────────────────────────────────────────


async def list_reports(db: AsyncSession, status: ReportStatus, limit: int) -> list[ReportOut]:
    """Open reports oldest first (the queue); closed ones newest first (the history)."""
    order = Report.created_at.asc() if status == ReportStatus.OPEN else Report.created_at.desc()
    reports = (
        await db.scalars(select(Report).where(Report.status == status).order_by(order).limit(limit))
    ).all()
    return await describe(db, reports)


async def describe(db: AsyncSession, reports: Sequence[Report]) -> list[ReportOut]:
    if not reports:
        return []
    ids = {r.reporter_id for r in reports} | {r.target_id for r in reports}
    users = {u.id: u for u in await db.scalars(select(User).where(User.id.in_(ids)))}
    targets = {r.target_id for r in reports}
    open_counts: dict[uuid.UUID, int] = dict(
        (
            await db.execute(
                select(Report.target_id, func.count())
                .where(Report.target_id.in_(targets), Report.status == ReportStatus.OPEN)
                .group_by(Report.target_id)
            )
        ).all()
    )
    out = []
    for r in reports:
        reporter, target = users[r.reporter_id], users[r.target_id]
        out.append(
            ReportOut(
                id=r.id,
                reporter=PlayerOut(id=reporter.id, username=reporter.username),
                target=ReportTargetOut(
                    id=target.id,
                    username=target.username,
                    suspended_until=target.suspended_until,
                ),
                reason=ReportReason(r.reason),
                details=r.details,
                game_id=r.game_id,
                status=ReportStatus(r.status),
                created_at=r.created_at,
                resolved_at=r.resolved_at,
                open_reports_against_target=open_counts.get(r.target_id, 0),
            )
        )
    return out


async def dismiss(
    db: AsyncSession, now: datetime, moderator: User, report_id: uuid.UUID, reason: str
) -> ReportOut:
    """Close a report without acting on the player."""
    found = await db.get(Report, report_id)
    if found is None:
        raise AppError(404, "report_not_found", "No such report.")
    if found.status != ReportStatus.OPEN:
        raise AppError(409, "report_closed", "This report has already been dealt with.")
    _close(found, ReportStatus.DISMISSED, now, moderator)
    _log(db, now, moderator, found.target_id, action=ActionKind.DISMISS_REPORT, reason=reason)
    await db.commit()
    (out,) = await describe(db, [found])
    return out


def _close(found: Report, status: ReportStatus, now: datetime, moderator: User) -> None:
    found.status = status
    found.open_key = None
    found.resolved_at = now
    found.resolved_by = moderator.id


def _log(  # noqa: PLR0913 - the whole log entry
    db: AsyncSession,
    now: datetime,
    moderator: User,
    target_id: uuid.UUID,
    *,
    action: ActionKind,
    reason: str,
) -> None:
    db.add(
        ModerationAction(
            moderator_id=moderator.id,
            target_id=target_id,
            action=action,
            reason=reason,
            created_at=now,
        )
    )


# ── Players ───────────────────────────────────────────────────────────────


async def find_any(db: AsyncSession, username: str) -> User:
    """A player by name whatever their state (suspended ones included)."""
    user = await db.scalar(select(User).where(User.username_key == username_key(username)))
    if user is None:
        raise AppError(404, "player_not_found", "No such player.")
    return user


async def record(db: AsyncSession, user: User) -> ModPlayerOut:
    reports = (
        await db.scalars(
            select(Report)
            .where(Report.target_id == user.id)
            .order_by(Report.created_at.desc())
            .limit(RECORD_REPORTS)
        )
    ).all()
    actions = (
        await db.execute(
            select(ModerationAction, User.username)
            .outerjoin(User, User.id == ModerationAction.moderator_id)
            .where(ModerationAction.target_id == user.id)
            .order_by(ModerationAction.created_at.desc())
            .limit(RECORD_REPORTS)
        )
    ).all()
    return ModPlayerOut(
        id=user.id,
        username=user.username,
        created_at=user.created_at,
        role=user.role,
        deleted=user.deleted_at is not None,
        suspended_until=user.suspended_until,
        banned=user.suspended_until is not None and user.suspended_until >= PERMANENT,
        suspension_reason=user.suspension_reason,
        reports=await describe(db, reports),
        actions=[
            ModActionOut(
                action=ActionKind(a.action),
                reason=a.reason,
                moderator=name,
                created_at=a.created_at,
            )
            for a, name in actions
        ],
    )


def _check_target(moderator: User, target: User) -> None:
    if target.id == moderator.id:
        raise AppError(422, "cannot_moderate_self", "You cannot do this to your own account.")
    if target.role == MODERATOR:
        raise AppError(403, "cannot_moderate_moderator", "Moderators cannot act on moderators.")
    if not target.is_active:
        raise AppError(409, "account_deleted", "This account has been deleted.")


async def suspend(  # noqa: PLR0913 - who, for how long, and why
    db: AsyncSession,
    now: datetime,
    moderator: User,
    target: User,
    *,
    days: int | None,
    reason: str,
) -> tuple[Sequence[Challenge], Mail]:
    """Suspend a player (``days=None``: for good). They are signed out everywhere, their open
    challenges close, and the open reports about them count as dealt with. The caller ends
    their live game and tells everyone affected."""
    _check_target(moderator, target)
    until = PERMANENT if days is None else now + timedelta(days=days)
    target.suspended_until = until
    target.suspension_reason = reason
    target.updated_at = now
    await db.execute(delete(Session).where(Session.user_id == target.id))
    closed = await close_open_challenges(db, target.id, now)
    await db.execute(
        update(Report)
        .where(Report.target_id == target.id, Report.status == ReportStatus.OPEN)
        .values(
            status=ReportStatus.ACTIONED, open_key=None, resolved_at=now, resolved_by=moderator.id
        )
    )
    _log(db, now, moderator, target.id, action=ActionKind.SUSPEND, reason=reason)
    await db.commit()
    how_long = (
        "permanently banned"
        if days is None
        else f"suspended until {until:%d %B %Y, %H:%M} UTC ({days} day{'s' * (days != 1)})"
    )
    return closed, Mail(
        target.email,
        "Your Bagh Chal account has been suspended",
        f"Hello {target.username},\n\nYour account has been {how_long}.\n\nReason: {reason}\n\n"
        "If you think this is a mistake, reply to this email.",
    )


async def unsuspend(
    db: AsyncSession, now: datetime, moderator: User, target: User, reason: str
) -> Mail:
    _check_target(moderator, target)
    if not is_suspended(target, now):
        raise AppError(409, "not_suspended", "This player is not suspended.")
    target.suspended_until = None
    target.suspension_reason = None
    target.updated_at = now
    _log(db, now, moderator, target.id, action=ActionKind.UNSUSPEND, reason=reason)
    await db.commit()
    return Mail(
        target.email,
        "Your Bagh Chal account is active again",
        f"Hello {target.username},\n\nYour suspension has been lifted; you can sign in and play "
        "again.",
    )


async def rename(  # noqa: PLR0913 - who, the new name, and why
    db: AsyncSession,
    settings: Settings,
    now: datetime,
    moderator: User,
    target: User,
    *,
    username: str,
    reason: str,
) -> Mail:
    """Give a player a new username (for an offensive one); the player is told why."""
    _check_target(moderator, target)
    if not username_allowed(settings, username):
        raise AppError(409, "username_unavailable", "That username is not available.")
    key = username_key(username)
    if await db.scalar(select(User.id).where(User.username_key == key, User.id != target.id)):
        raise AppError(409, "username_taken", "That username is taken.")
    old = target.username
    target.username, target.username_key = username, key
    target.updated_at = now
    _log(
        db,
        now,
        moderator,
        target.id,
        action=ActionKind.RENAME,
        reason=f"{old} → {username}: {reason}",
    )
    await db.commit()
    return Mail(
        target.email,
        "Your Bagh Chal username was changed",
        f"Hello,\n\nA moderator changed your username from {old} to {username}.\n\n"
        f"Reason: {reason}\n\nSign in with {username} or your email address from now on.",
    )
