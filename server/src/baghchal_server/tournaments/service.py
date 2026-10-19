"""Tournaments (a Pro feature): Swiss tournaments among 3 to 32 friends, joined by invitation.

When the host starts it, the number of rounds is set (``swiss.rounds_for``) and round 1 is
paired, by rating. Each round is paired when the one before is finished: players on the same
score meet, nobody twice if it can be avoided, sides alternate, and an odd player out has a
bye (a point). Games are casual; either player starts a pairing's game whenever the other is
online, and an aborted game can be played again. Standings come from the games: a point for a
win or a bye, ties broken by Buchholz. The tournament ends after the last round, or when the
host ends it.
"""

import secrets
import uuid
from datetime import datetime
from typing import Final, cast

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
from baghchal_server.lobby.time_controls import TIME_CONTROLS, category_of
from baghchal_server.ratings.models import PlayerRating
from baghchal_server.realtime.presence import Presence
from baghchal_server.tournaments import swiss
from baghchal_server.tournaments.models import Entry, Pairing, Tournament
from baghchal_server.tournaments.schemas import (
    MIN_PLAYERS,
    ByeOut,
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
        rounds=0,
        round=0,
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


async def _ratings(
    db: AsyncSession, tournament: Tournament, players: list[uuid.UUID]
) -> dict[uuid.UUID, float]:
    tc = TIME_CONTROLS[tournament.time_control]
    category = category_of(tc.initial_seconds, tc.increment_seconds)
    rows = await db.execute(
        select(PlayerRating.user_id, PlayerRating.rating).where(
            PlayerRating.user_id.in_(players), PlayerRating.category == category
        )
    )
    return dict(rows.all())


def _add_round(db: AsyncSession, tournament: Tournament, records: list[swiss.Record]) -> None:
    """Pair the next round and add its pairings (and bye)."""
    pairs, bye = swiss.pair(records)
    db.add_all(
        Pairing(
            id=uuid.uuid4(),
            tournament_id=tournament.id,
            round=tournament.round,
            goat_id=goat,
            tiger_id=tiger,
        )
        for goat, tiger in pairs
    )
    if bye is not None:
        db.add(
            Pairing(
                id=uuid.uuid4(),
                tournament_id=tournament.id,
                round=tournament.round,
                goat_id=bye,
                tiger_id=None,
            )
        )


async def start(db: AsyncSession, now: datetime, user_id: uuid.UUID, code: str) -> Tournament:
    """Close entries, set the number of rounds and pair round 1 (by rating)."""
    tournament = await find(db, code)
    _hosted(tournament, user_id)
    if tournament.status != TournamentStatus.OPEN:
        raise AppError(409, "tournament_started", "This tournament has already started.")
    players = await _players(db, tournament)
    if len(players) < MIN_PLAYERS:
        raise AppError(
            409, "not_enough_players", f"A tournament needs at least {MIN_PLAYERS} players."
        )
    ratings = await _ratings(db, tournament, players)
    tournament.rounds, tournament.round = swiss.rounds_for(len(players)), 1
    _add_round(db, tournament, [swiss.Record(uid, 0, ratings.get(uid, 1500.0)) for uid in players])
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
    if pairing.tiger_id is None:
        raise AppError(409, "pairing_played", "This round is a bye: there is no game to play.")
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


def _winner(p: Pairing, game: Game) -> uuid.UUID:
    return p.goat_id if game.winner == "goat" else p.tiger_id  # type: ignore[return-value]


async def describe(db: AsyncSession, now: datetime, tournament: Tournament) -> TournamentOut:
    """The tournament as it stands. When the round being played is over, the next is paired
    here (or, after the last, the tournament ends)."""
    players = await _players(db, tournament)
    pairings = list(
        await db.scalars(
            select(Pairing)
            .where(Pairing.tournament_id == tournament.id)
            .order_by(Pairing.round.desc(), Pairing.id)
        )
    )
    game_ids = [p.game_id for p in pairings if p.game_id is not None]
    found = {g.id: g for g in await db.scalars(select(Game).where(Game.id.in_(game_ids)))}
    states = {
        p.id: PairingState.DONE
        if p.tiger_id is None
        else _state(None if p.game_id is None else found.get(p.game_id))
        for p in pairings
    }
    current = [p for p in pairings if p.round == tournament.round]
    if (
        tournament.status == TournamentStatus.RUNNING
        and current
        and all(states[p.id] == PairingState.DONE for p in current)
    ):
        if tournament.round < tournament.rounds:
            tournament.round += 1
            _add_round(
                db,
                tournament,
                _records(pairings, found, players, await _ratings(db, tournament, players)),
            )
        else:
            tournament.status, tournament.finished_at = TournamentStatus.FINISHED, now
        await db.commit()
        if tournament.status == TournamentStatus.RUNNING:
            return await describe(db, now, tournament)

    people = {tournament.host_id, *players}
    names = dict(
        (await db.execute(select(User.id, User.username).where(User.id.in_(people)))).all()
    )

    def who(uid: uuid.UUID) -> PlayerOut:
        return PlayerOut(id=uid, username=names[uid])

    points = dict.fromkeys(players, 0)
    played = dict.fromkeys(players, 0)
    met: dict[uuid.UUID, list[uuid.UUID]] = {uid: [] for uid in players}
    out_pairings, byes = [], []
    for p in pairings:
        if p.tiger_id is None:
            points[p.goat_id] += 1
            byes.append(ByeOut(round=p.round, player=who(p.goat_id)))
            continue
        game = None if p.game_id is None else found.get(p.game_id)
        winner = None
        if states[p.id] == PairingState.DONE:
            assert game is not None  # noqa: S101 - done means a finished game
            winner = _winner(p, game)
            points[winner] += 1
            for a, b in ((p.goat_id, p.tiger_id), (p.tiger_id, p.goat_id)):
                played[a] += 1
                met[a].append(b)
        out_pairings.append(
            PairingOut(
                id=p.id,
                round=p.round,
                goat=who(p.goat_id),
                tiger=who(p.tiger_id),
                state=states[p.id],
                game_id=p.game_id if states[p.id] != PairingState.WAITING else None,
                winner=None if winner is None else who(winner),
            )
        )
    buchholz = {uid: sum(points[o] for o in met[uid]) for uid in players}
    order = sorted(players, key=lambda uid: (-points[uid], -buchholz[uid], names[uid].lower()))
    return TournamentOut(
        code=tournament.code,
        name=tournament.name,
        host=who(tournament.host_id),
        time_control=tournament.time_control,
        max_players=tournament.max_players,
        status=TournamentStatus(tournament.status),
        round=tournament.round,
        rounds=tournament.rounds,
        players=[who(uid) for uid in players],
        standings=(
            []
            if tournament.status == TournamentStatus.OPEN
            else [
                StandingOut(
                    player=who(uid),
                    points=points[uid],
                    buchholz=buchholz[uid],
                    played=played[uid],
                )
                for uid in order
            ]
        ),
        pairings=out_pairings,
        byes=byes,
        created_at=tournament.created_at,
    )


def _records(
    pairings: list[Pairing],
    games: dict[uuid.UUID, Game],
    players: list[uuid.UUID],
    ratings: dict[uuid.UUID, float],
) -> list[swiss.Record]:
    """Where each player stands after the rounds played, for pairing the next."""
    records = {uid: swiss.Record(uid, 0, ratings.get(uid, 1500.0)) for uid in players}
    for p in sorted(pairings, key=lambda p: p.round):
        if p.tiger_id is None:
            records[p.goat_id].score += 1
            records[p.goat_id].had_bye = True
            continue
        goat, tiger = records[p.goat_id], records[p.tiger_id]
        goat.opponents.add(tiger.id)
        tiger.opponents.add(goat.id)
        goat.goats, goat.last_side = goat.goats + 1, "goat"
        tiger.tigers, tiger.last_side = tiger.tigers + 1, "tiger"
        # The rounds played are over: every game in them has a winner.
        records[_winner(p, games[cast(uuid.UUID, p.game_id)])].score += 1
    return list(records.values())
