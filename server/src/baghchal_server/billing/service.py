"""What a player may use: their plan's features plus whatever admins have granted them.

Every grant and revocation is written to the moderation log with its reason, and the player is
told by email. Admins are made from the command line only (``baghchal_server.moderators``).
"""

import uuid
from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing.models import Grant
from baghchal_server.billing.plans import FEATURE_NAMES, FEATURES, NAMES, RANK, Feature, Plan
from baghchal_server.billing.schemas import GrantIn, GrantOut, MyPlanOut, PlayerPlanOut
from baghchal_server.errors import AppError
from baghchal_server.mail import Mail
from baghchal_server.moderation.models import ActionKind, ModerationAction
from baghchal_server.payments.models import Payment


@dataclass(frozen=True)
class Entitlements:
    plan: Plan
    plan_until: datetime | None
    features: frozenset[Feature]
    granted: frozenset[Feature]
    """Features granted one by one (beyond the plan)."""

    def has(self, feature: Feature) -> bool:
        return feature in self.features


def _active(grant: Grant, now: datetime) -> bool:
    return (
        grant.revoked_at is None
        and grant.starts_at <= now
        and (grant.ends_at is None or grant.ends_at > now)
    )


async def _grants(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> list[Grant]:
    """The grants in force now."""
    found = await db.scalars(
        select(Grant).where(
            Grant.user_id == user_id,
            Grant.revoked_at.is_(None),
            Grant.starts_at <= now,
            or_(Grant.ends_at.is_(None), Grant.ends_at > now),
        )
    )
    return list(found)


def _entitlements(grants: list[Grant]) -> Entitlements:
    plan, plan_until = Plan.FREE, None
    for g in grants:
        if g.plan is None:
            continue
        granted = Plan(g.plan)
        if RANK[granted] > RANK[plan]:
            plan, plan_until = granted, g.ends_at
        elif granted == plan and plan_until is not None:
            plan_until = None if g.ends_at is None else max(plan_until, g.ends_at)
    single = frozenset(Feature(g.feature) for g in grants if g.feature is not None)
    return Entitlements(plan, plan_until, FEATURES[plan] | single, single)


async def entitlements(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> Entitlements:
    return _entitlements(await _grants(db, user_id, now))


async def entitlements_of(
    db: AsyncSession, user_ids: Collection[uuid.UUID], now: datetime
) -> dict[uuid.UUID, Entitlements]:
    """Several players' entitlements at once (for badges on lists and games)."""
    found = await db.scalars(
        select(Grant).where(
            Grant.user_id.in_(user_ids),
            Grant.revoked_at.is_(None),
            Grant.starts_at <= now,
            or_(Grant.ends_at.is_(None), Grant.ends_at > now),
        )
    )
    by_user: dict[uuid.UUID, list[Grant]] = {uid: [] for uid in user_ids}
    for g in found:
        by_user[g.user_id].append(g)
    return {uid: _entitlements(grants) for uid, grants in by_user.items()}


async def require(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, feature: Feature, what: str
) -> Entitlements:
    """The player's entitlements, or ``upgrade_required`` when they lack ``feature``."""
    found = await entitlements(db, user_id, now)
    if not found.has(feature):
        plan = Plan.PLUS if feature in FEATURES[Plan.PLUS] else Plan.PRO
        raise AppError(403, "upgrade_required", f"{what} comes with ClawPlay {NAMES[plan]}.")
    return found


async def _out(db: AsyncSession, grants: list[Grant], now: datetime) -> list[GrantOut]:
    admins = {g.granted_by for g in grants if g.granted_by is not None}
    names = dict(
        (await db.execute(select(User.id, User.username).where(User.id.in_(admins)))).all()
    )
    paid = set(
        await db.scalars(
            select(Payment.grant_id).where(Payment.grant_id.in_([g.id for g in grants]))
        )
    )
    return [
        GrantOut(
            id=g.id,
            plan=g.plan,
            feature=g.feature,
            starts_at=g.starts_at,
            ends_at=g.ends_at,
            reason=g.reason,
            granted_by=names.get(g.granted_by) if g.granted_by is not None else None,
            created_at=g.created_at,
            revoked_at=g.revoked_at,
            active=_active(g, now),
            paid=g.id in paid,
        )
        for g in grants
    ]


async def my_plan(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> MyPlanOut:
    grants = await _grants(db, user_id, now)
    found = _entitlements(grants)
    return MyPlanOut(
        plan=found.plan,
        plan_until=found.plan_until,
        features=sorted(found.features),
        grants=await _out(db, grants, now),
    )


async def player_plan(db: AsyncSession, player: User, now: datetime) -> PlayerPlanOut:
    mine = await my_plan(db, player.id, now)
    every = (
        await db.scalars(
            select(Grant)
            .where(Grant.user_id == player.id)
            .order_by(Grant.created_at.desc(), Grant.id)
            .limit(100)
        )
    ).all()
    return PlayerPlanOut(
        **mine.model_dump(), username=player.username, history=await _out(db, list(every), now)
    )


def _what(grant: Grant) -> str:
    if grant.plan is not None:
        return f"ClawPlay {NAMES[Plan(grant.plan)]}"
    return FEATURE_NAMES[Feature(grant.feature)]  # type: ignore[arg-type]


def _log(  # noqa: PLR0913 - the whole log entry
    db: AsyncSession, now: datetime, admin: User, target: User, *, action: ActionKind, reason: str
) -> None:
    db.add(
        ModerationAction(
            moderator_id=admin.id, target_id=target.id, action=action, reason=reason, created_at=now
        )
    )


def _check_target(target: User) -> None:
    if not target.is_active:
        raise AppError(409, "account_deleted", "This account has been deleted.")
    if target.role == "bot":
        raise AppError(422, "not_a_player", "The computer players have no plans.")


async def grant(
    db: AsyncSession, now: datetime, admin: User, target: User, data: GrantIn
) -> tuple[GrantOut, Mail]:
    _check_target(target)
    row = Grant(
        user_id=target.id,
        plan=data.plan,
        feature=data.feature,
        starts_at=now,
        ends_at=None if data.days is None else now + timedelta(days=data.days),
        reason=data.reason,
        granted_by=admin.id,
        created_at=now,
    )
    db.add(row)
    what = _what(row)
    _log(db, now, admin, target, action=ActionKind.GRANT, reason=f"{what}: {data.reason}")
    await db.commit()
    until = "for good" if row.ends_at is None else f"until {row.ends_at:%d %B %Y}"
    mail = Mail(
        target.email,
        f"You have {what}",
        f"Hello {target.username},\n\nYou have been given {what} {until}.\n\n"
        f"Note from ClawPlay: {data.reason}\n\nEnjoy your games!",
    )
    return (await _out(db, [row], now))[0], mail


async def revoke(
    db: AsyncSession, now: datetime, admin: User, grant_id: uuid.UUID, reason: str
) -> tuple[GrantOut, Mail]:
    row = await db.get(Grant, grant_id)
    if row is None:
        raise AppError(404, "grant_not_found", "No such grant.")
    if not _active(row, now):
        raise AppError(409, "grant_not_active", "This grant has already ended.")
    target = await db.get(User, row.user_id)
    assert target is not None  # noqa: S101 - grants go when their player does
    row.revoked_at = now
    row.revoked_by = admin.id
    what = _what(row)
    _log(db, now, admin, target, action=ActionKind.REVOKE, reason=f"{what}: {reason}")
    await db.commit()
    mail = Mail(
        target.email,
        f"Your {what} has ended",
        f"Hello {target.username},\n\nYour {what} has ended.\n\nNote from ClawPlay: {reason}",
    )
    return (await _out(db, [row], now))[0], mail
