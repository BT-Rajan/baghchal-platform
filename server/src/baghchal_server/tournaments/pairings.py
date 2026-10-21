"""A tournament pairing's game: where it stands, and starting it when the challenge that
"Play now" sent is accepted.

Apart from ``service`` because the lobby answers that challenge, and ``service`` builds on
the lobby.
"""

from datetime import datetime

from sqlalchemy import ColumnElement, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.models import Game, GameStatus
from baghchal_server.lobby.models import Challenge
from baghchal_server.tournaments.models import Pairing, Tournament
from baghchal_server.tournaments.schemas import PairingState, TournamentStatus


def state_of(game: Game | None) -> PairingState:
    """Where a pairing with this game (or none) stands, unless won without a game."""
    if game is None or (
        game.status == GameStatus.FINISHED and game.winner is None and not games.drawn(game)
    ):
        return PairingState.WAITING  # not started, or aborted: to be played (again)
    return PairingState.PLAYING if game.status == GameStatus.ACTIVE else PairingState.DONE


def unstarted(pairing: Pairing) -> ColumnElement[bool]:
    """The pairing still has the game it had when read (none, or an aborted one)."""
    return (
        Pairing.game_id.is_(None) if pairing.game_id is None else Pairing.game_id == pairing.game_id
    )


async def check_waiting(db: AsyncSession, pairing: Pairing) -> None:
    """Refuse unless the pairing's game is still to be played in a running tournament."""
    tournament = await db.get(Tournament, pairing.tournament_id)
    if tournament is None or tournament.status != TournamentStatus.RUNNING:
        raise AppError(409, "tournament_not_running", "This tournament is not being played.")
    if pairing.tiger_id is None:
        raise AppError(409, "pairing_played", "This round is a bye: there is no game to play.")
    before = None if pairing.game_id is None else await db.get(Game, pairing.game_id)
    if pairing.forfeit_to is not None or state_of(before) != PairingState.WAITING:
        raise AppError(409, "pairing_played", "This game has already been played.")


async def start_game(
    db: AsyncSession, now: datetime, challenge: Challenge, pairing: Pairing
) -> Game:
    """Start the pairing's game for its accepted challenge (caller commits), once: the pairing
    must still have the game it had when ``check_waiting`` read it.

    Raises IntegrityError if either player is already in a live game.
    """
    game = await games.start_game(db, challenge, now)
    claimed = await db.execute(
        update(Pairing)
        .where(Pairing.id == pairing.id, Pairing.forfeit_to.is_(None), unstarted(pairing))
        .values(game_id=game.id)
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise AppError(409, "pairing_played", "This game has just been started.")
    return game
