"""Moving tournaments on, and telling their players: called wherever a round can end (a game
ends, the host gives a game, a player leaves or blocks another)."""

from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.deps import AppState
from baghchal_server.games.models import Game, GameStatus
from baghchal_server.notifications import service as notifications
from baghchal_server.notifications.schemas import NotificationKind
from baghchal_server.tournaments import service
from baghchal_server.tournaments.models import Tournament


async def moved_on(state: AppState, db: AsyncSession, tournaments: list[Tournament]) -> None:
    """Pair each tournament's next round if its round is over, and tell the players: their
    game (or bye) in it, or that it has ended."""
    for tournament in tournaments:
        step = await service.advance(db, state.clock(), tournament)
        if step is None:
            continue
        code = tournament.code
        if step.pairings:
            for p in step.pairings:
                for player, opponent in ((p.goat_id, p.tiger_id), (p.tiger_id, p.goat_id)):
                    if player is not None:
                        await notifications.notify(
                            state,
                            db,
                            player,
                            NotificationKind.TOURNAMENT_ROUND,
                            actor_id=opponent,
                            ref=code,
                        )
        else:
            for player in await service.players_of(db, tournament):
                await notifications.notify(
                    state, db, player, NotificationKind.TOURNAMENT_FINISHED, ref=code
                )


async def after_game(state: AppState, db: AsyncSession, game: Game) -> None:
    """A game ended: if it was a tournament's, its round may be over."""
    if game.status != GameStatus.FINISHED:
        return
    tournament = await service.of_game(db, game.id)
    if tournament is not None:
        await moved_on(state, db, [tournament])
