"""Queueing a finished game for its fair-play check (kept apart from the service, which uses
the games service: this is called from it)."""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.fair_play.models import CheckStatus, FairPlayCheck
from baghchal_server.fair_play.thresholds import MIN_PLIES
from baghchal_server.games.models import Game


def enqueue(db: AsyncSession, game: Game, now: datetime) -> None:
    """Queue a game that has just ended for its check, in the transaction that rates it: rated
    games with a result and enough moves to go on."""
    if game.rated and game.winner is not None and game.ply >= MIN_PLIES:
        db.add(
            FairPlayCheck(game_id=game.id, status=CheckStatus.PENDING, attempts=0, created_at=now)
        )
