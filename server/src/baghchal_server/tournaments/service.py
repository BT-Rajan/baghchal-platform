"""Small tournaments (a Pro feature): a round robin among 3 to 6 friends, joined by invitation.

Each player plays each other player twice, once with each side, in casual games. Either player
starts a pairing's game whenever the other is online; an aborted game can be played again.
Standings come from the games themselves: a point for each win. The tournament ends when every
pairing is played, or when the host ends it.
"""

import itertools
import secrets
import uuid
from datetime import datetime
from typing import Final

from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import Feature
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.models import Game, GameStatus
from baghchal_server.lobby import service as lobby
from baghchal_server.lobby.models import Block
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.lobby.time_controls import TIME_CONTROLS
from baghchal_server.realtime.presence import Presence
from baghchal_server.tournaments.models import Entry, Pairing, Tournament
from baghchal_server.tournaments.schemas import (
    MIN_PLAYERS,
    PairingOut,
    PairingState,
    StandingOut,
    TournamentIn,
    TournamentOut,
    TournamentStatus,
)

WHAT: Final = "A tournament"
HOSTING: Final = 3
"""Tournaments one player may host at once (open or running)."""
LISTED: Final = 20


async def create(db: AsyncSession, now: datetime, host: User, data: TournamentIn) -> Tournament:
    await billing.require(db, host.id, now, Feature.TOURNAMENTS, WHAT)
    hosting = await db.scalars(
        select(Tournament.id).where(
            Tournament.host_id == host.id, Tournament.status != TournamentStatus.FINISHED
        )
    )
    if len(hosting.all()) >= HOSTING:
        raise AppError(
            409, "too_many_tournaments", f"You are hosting {HOSTING} tournaments; finish one first."
        )
    tournament = Tournament(
        id=uuid.uuid4(),
        code=secrets.token_urlsafe(6),
        name=data.name,
        host_id=host.id,
        time_control=data.time_control,
        max_players=data.max_players,
        status=TournamentStatus.OPEN,
        created_at=now,
    )
    db.add(tournament)
    await db.flush()
    db.add(Entry(tournament_id=tournament.id, user_id=host.id, joined_at=now))
    await db.commit()
    return tournament


async def find(db: AsyncSession, code: str) -> Tournament:
    tournament = await db.scalar(select(Tournament).where(Tournament.code == code))
    if tournament is None:
        raise AppError(404, "tournament_not_found", "No such tournament.")
    return tournament


async def _players(db: AsyncSession, tournament: Tournament) -> list[uuid.UUID]:
    found = await db.scalars(
        select(Entry.user_id)
        .where(Entry.tournament_id == tournament.id)
        .order_by(Entry.joined_at, Entry.user_id)
    )
    return list(found)


async def mine(db: AsyncSession, user_id: uuid.UUID) -> list[Tournament]:
    """Tournaments I am in, newest first."""
    found = await db.scalars(
        select(Tournament)
        .join(Entry, Entry.tournament_id == Tournament.id)
        .where(Entry.user_id == user_id)
        .order_by(Tournament.created_at.desc())
        .limit(LISTED)
    )
    return list(found)


async def join(db: AsyncSession, now: datetime, user: User, code: str) -> Tournament:
    tournament = await find(db, code)
    players = await _players(db, tournament)
    if user.id in players:
        return tournament
    if tournament.status != TournamentStatus.OPEN:
        raise AppError(409, "tournament_started", "This tournament has already started.")
    if len(players) >= tournament.max_players:
        raise AppError(409, "tournament_full", "This tournament is full.")
    blocked = await db.scalar(
        select(Block.blocker_id).where(
            or_(
                and_(Block.blocker_id.in_(players), Block.blocked_id == user.id),
                and_(Block.blocker_id == user.id, Block.blocked_id.in_(players)),
            )
        )
    )
    if blocked is not None:
        raise AppError(
            403,
            "player_blocked",
            "You cannot join: you and a player in it have blocked one another.",
        )
    db.add(Entry(tournament_id=tournament.id, user_id=user.id, joined_at=now))
    await db.commit()
    return tournament


async def leave(db: AsyncSession, user_id: uuid.UUID, code: str) -> Tournament:
    tournament = await find(db, code)
    if tournament.host_id == user_id:
        raise AppError(409, "host_cannot_leave", "The host stays; end the tournament instead.")
    if tournament.status != TournamentStatus.OPEN:
        raise AppError(409, "tournament_started", "This tournament has already started.")
    entry = await db.get(Entry, (tournament.id, user_id))
    if entry is not None:
        await db.delete(entry)
    await db.commit()
    return tournament


def _hosted(tournament: Tournament, user_id: uuid.UUID) -> None:
    if tournament.host_id != user_id:
        raise AppError(403, "not_host", "Only the host can do this.")


async def start(db: AsyncSession, now: datetime, user_id: uuid.UUID, code: str) -> Tournament:
    """Close entries and draw up the round robin: every player against every other, once
    with each side."""
    tournament = await find(db, code)
    _hosted(tournament, user_id)
    if tournament.status != TournamentStatus.OPEN:
        raise AppError(409, "tournament_started", "This tournament has already started.")
    players = await _players(db, tournament)
    if len(players) < MIN_PLAYERS:
        raise AppError(
            409, "not_enough_players", f"A tournament needs at least {MIN_PLAYERS} players."
        )
    db.add_all(
        Pairing(id=uuid.uuid4(), tournament_id=tournament.id, goat_id=goat, tiger_id=tiger)
        for goat, tiger in itertools.permutations(players, 2)
    )
    tournament.status, tournament.started_at = TournamentStatus.RUNNING, now
    await db.commit()
    return tournament


async def finish(db: AsyncSession, now: datetime, user_id: uuid.UUID, code: str) -> Tournament:
    """End the tournament now; pairings not played stay unplayed."""
    tournament = await find(db, code)
    _hosted(tournament, user_id)
    if tournament.status != TournamentStatus.FINISHED:
        tournament.status, tournament.finished_at = TournamentStatus.FINISHED, now
    await db.commit()
    return tournament


def _state(game: Game | None) -> PairingState:
    if game is None or (game.status == GameStatus.FINISHED and game.winner is None):
        return PairingState.WAITING  # not started, or aborted: to be played (again)
    return PairingState.PLAYING if game.status == GameStatus.ACTIVE else PairingState.DONE


async def play(  # noqa: PLR0913, PLR0917 - who starts which pairing of which tournament
    db: AsyncSession,
    presence: Presence,
    now: datetime,
    user: User,
    code: str,
    pairing_id: uuid.UUID,
) -> Game:
    tournament = await find(db, code)
    if tournament.status != TournamentStatus.RUNNING:
        raise AppError(409, "tournament_not_running", "This tournament is not being played.")
    pairing = await db.get(Pairing, pairing_id)
    if pairing is None or pairing.tournament_id != tournament.id:
        raise AppError(404, "pairing_not_found", "No such game in this tournament.")
    if user.id not in (pairing.goat_id, pairing.tiger_id):
        raise AppError(403, "not_your_game", "This is not your game.")
    before = None if pairing.game_id is None else await db.get(Game, pairing.game_id)
    if _state(before) != PairingState.WAITING:
        raise AppError(409, "pairing_played", "This game has already been played.")
    opponent = pairing.tiger_id if user.id == pairing.goat_id else pairing.goat_id
    if not await presence.online([opponent]):
        raise AppError(409, "player_offline", "Your opponent is not online.")
    await lobby.check_abort_cooldown(db, user.id, now)
    tc = TIME_CONTROLS[tournament.time_control]
    try:
        game = await games.start_casual_game(
            db,
            now,
            goat_id=pairing.goat_id,
            tiger_id=pairing.tiger_id,
            initial_seconds=tc.initial_seconds,
            increment_seconds=tc.increment_seconds,
        )
    except IntegrityError:
        await db.rollback()
        raise lobby.busy_error() from None
    claimed = await db.execute(
        update(Pairing)
        .where(
            Pairing.id == pairing.id,
            Pairing.game_id.is_(None)
            if pairing.game_id is None
            else Pairing.game_id == pairing.game_id,
        )
        .values(game_id=game.id)
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise AppError(409, "pairing_played", "This game has just been started.")
    await db.commit()
    return game


async def describe(db: AsyncSession, now: datetime, tournament: Tournament) -> TournamentOut:
    players = await _players(db, tournament)
    pairings = list(await db.scalars(select(Pairing).where(Pairing.tournament_id == tournament.id)))
    game_ids = [p.game_id for p in pairings if p.game_id is not None]
    found = {g.id: g for g in await db.scalars(select(Game).where(Game.id.in_(game_ids)))}
    people = {tournament.host_id, *players}
    names = dict(
        (await db.execute(select(User.id, User.username).where(User.id.in_(people)))).all()
    )

    def who(uid: uuid.UUID) -> PlayerOut:
        return PlayerOut(id=uid, username=names[uid])

    out_pairings = []
    points = dict.fromkeys(players, 0)
    played = dict.fromkeys(players, 0)
    for p in pairings:
        game = None if p.game_id is None else found.get(p.game_id)
        state = _state(game)
        winner = None
        if state == PairingState.DONE:
            assert game is not None  # noqa: S101 - done means a finished game
            winner = p.goat_id if game.winner == "goat" else p.tiger_id
            points[winner] += 1
            played[p.goat_id] += 1
            played[p.tiger_id] += 1
        out_pairings.append(
            PairingOut(
                id=p.id,
                goat=who(p.goat_id),
                tiger=who(p.tiger_id),
                state=state,
                game_id=p.game_id if state != PairingState.WAITING else None,
                winner=None if winner is None else who(winner),
            )
        )
    if (
        tournament.status == TournamentStatus.RUNNING
        and out_pairings
        and all(p.state == PairingState.DONE for p in out_pairings)
    ):
        tournament.status, tournament.finished_at = TournamentStatus.FINISHED, now
        await db.commit()
    order = sorted(players, key=lambda uid: (-points[uid], names[uid].lower()))
    return TournamentOut(
        code=tournament.code,
        name=tournament.name,
        host=who(tournament.host_id),
        time_control=tournament.time_control,
        max_players=tournament.max_players,
        status=TournamentStatus(tournament.status),
        players=[who(uid) for uid in players],
        standings=(
            []
            if tournament.status == TournamentStatus.OPEN
            else [
                StandingOut(player=who(uid), points=points[uid], played=played[uid])
                for uid in order
            ]
        ),
        pairings=out_pairings,
        created_at=tournament.created_at,
    )
