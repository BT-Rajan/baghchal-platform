"""Board themes, piece sets and sound packs (the themes feature), and badges (the badge
feature). The first of each is free; the rest come with ClawPlay Plus."""

import uuid
from collections.abc import Collection
from datetime import datetime
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.appearance.models import Appearance
from baghchal_server.appearance.schemas import (
    AppearanceIn,
    AppearanceOut,
    BoardTheme,
    PieceSet,
    SoundPack,
)
from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import Feature, Plan
from baghchal_server.lobby.schemas import Badge

FREE: Final = AppearanceOut(
    board=BoardTheme.WOOD, pieces=PieceSet.CLASSIC, sounds=SoundPack.GENTLE, show_badge=True
)
WHAT: Final = "A choice of boards, pieces and sounds"


def _themed(choice: AppearanceIn) -> bool:
    return (choice.board, choice.pieces, choice.sounds) != (FREE.board, FREE.pieces, FREE.sounds)


async def mine(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> AppearanceOut:
    row = await db.get(Appearance, user_id)
    if row is None:
        return FREE
    if not (await billing.entitlements(db, user_id, now)).has(Feature.THEMES):
        return FREE.model_copy(update={"show_badge": row.show_badge})
    return AppearanceOut(
        board=BoardTheme(row.board),
        pieces=PieceSet(row.pieces),
        sounds=SoundPack(row.sounds),
        show_badge=row.show_badge,
    )


async def choose(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, choice: AppearanceIn
) -> AppearanceOut:
    """Save the player's choice; anything beyond the free set needs the themes feature."""
    if _themed(choice):
        await billing.require(db, user_id, now, Feature.THEMES, WHAT)
    row = await db.get(Appearance, user_id)
    if row is None:
        row = Appearance(user_id=user_id)
        db.add(row)
    row.board, row.pieces, row.sounds = choice.board, choice.pieces, choice.sounds
    row.show_badge, row.updated_at = choice.show_badge, now
    await db.commit()
    return AppearanceOut.model_validate(choice.model_dump())


async def badges(
    db: AsyncSession, user_ids: Collection[uuid.UUID], now: datetime
) -> dict[uuid.UUID, Badge]:
    """The badge each of these players shows: Pro or Plus, for those with the badge feature who
    have not hidden it."""
    ids = set(user_ids)
    hidden = set(
        await db.scalars(
            select(Appearance.user_id).where(
                Appearance.user_id.in_(ids), Appearance.show_badge.is_(False)
            )
        )
    )
    found = await billing.entitlements_of(db, ids - hidden, now)
    return {
        uid: "pro" if e.plan == Plan.PRO else "plus"
        for uid, e in found.items()
        if e.has(Feature.BADGE)
    }
