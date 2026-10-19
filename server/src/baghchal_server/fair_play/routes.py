from fastapi import APIRouter
from sqlalchemy import select

from baghchal_engine.fair_play import Figures
from baghchal_server.accounts.models import User
from baghchal_server.deps import DB, State
from baghchal_server.fair_play import service, thresholds
from baghchal_server.fair_play.schemas import CheckedGameOut, FairPlayOut, FiguresOut
from baghchal_server.games.models import Game
from baghchal_server.lobby.schemas import PlayerOut, UsernameQuery
from baghchal_server.moderation import service as moderation
from baghchal_server.moderation.routes import Moderator

router = APIRouter(prefix="/api/v1")


def _figures(f: Figures) -> FiguresOut:
    return FiguresOut(
        moves=f.moves,
        decisive=f.decisive,
        agreement=round(f.agreement, 4),
        average_loss=round(f.average_loss, 1),
        mistake_rate=round(f.mistake_rate, 4),
        blunders=f.blunders,
    )


@router.get("/mod/players/{username}/fair-play")
async def fair_play(username: UsernameQuery, _: Moderator, state: State, db: DB) -> FairPlayOut:
    """The player's latest checked rated games and how close they came to the engine."""
    player = await moderation.find_any(db, username)
    rows = await service.window(db, player.id, state.clock())
    deep = await service.confirmations(db, player.id, [r.game_id for r in rows])
    found = {
        g.id: g
        for g in await db.scalars(select(Game).where(Game.id.in_([r.game_id for r in rows])))
    }
    opponent_ids = {
        found[r.game_id].tiger_id if r.side == "goat" else found[r.game_id].goat_id for r in rows
    }
    names = dict(
        (await db.execute(select(User.id, User.username).where(User.id.in_(opponent_ids)))).all()
    )
    games = []
    for r in rows:
        game = found[r.game_id]
        opponent = game.tiger_id if r.side == "goat" else game.goat_id
        confirm = deep.get(r.game_id)
        games.append(
            CheckedGameOut(
                game_id=r.game_id,
                side=r.side,
                opponent=PlayerOut(id=opponent, username=names[opponent]),
                checked_at=r.checked_at,
                screen=_figures(r.figures),
                confirm=None if confirm is None else _figures(confirm),
                think_median_ms=r.think_median_ms,
                think_spread=r.think_spread,
                fast_moves=r.fast_moves,
            )
        )
    screen = service.total(r.figures for r in rows)
    return FairPlayOut(
        games=games,
        screen=_figures(screen),
        confirm=_figures(service.total(deep.values())) if deep else None,
        screen_passed=len(rows) >= thresholds.MIN_GAMES and thresholds.SCREEN_BAR.passed(screen),
    )
