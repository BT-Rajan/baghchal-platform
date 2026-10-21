"""Tournaments (a Pro feature): Swiss tournaments among 3 to 32 friends, joined by invitation.

When the host starts it, the number of rounds is set (``swiss.rounds_for``) and round 1 is
paired, by rating. Each round is paired when the one before is finished: players on the same
score meet, nobody twice if it can be avoided, sides alternate, and an odd player out has a
bye (a point). Games are casual; either player asks the other, who must be online, with "Play
now": a challenge for the pairing, which starts its game when accepted (``pairings``). An
aborted game can be played again. Standings come from the games: a point for a
win or a bye, ties broken by Buchholz. The tournament ends after the last round, or when the
host ends it.
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Final, cast

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import Feature
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.models import Game
from baghchal_server.lobby import service as lobby
from baghchal_server.lobby.models import Block, Challenge, ChallengeStatus
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.lobby.time_controls import TIME_CONTROLS, category_of
from baghchal_server.ratings.models import PlayerRating
from baghchal_server.realtime.presence import Presence
from baghchal_server.tournaments import swiss
from baghchal_server.tournaments.models import Entry, Pairing, Tournament
from baghchal_server.tournaments.pairings import check_waiting, state_of, unstarted
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
            409,
            "too_many_tournaments",
            "You are hosting {limit} tournaments; finish one first.",
            limit=HOSTING,
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


async def _players(
    db: AsyncSession, tournament: Tournament, *, playing: bool = False
) -> list[uuid.UUID]:
    """Everyone in it, in the order they joined; with ``playing``, only those still paired
    (not withdrawn)."""
    query = select(Entry.user_id).where(Entry.tournament_id == tournament.id)
    if playing:
        query = query.where(Entry.withdrawn_at.is_(None))
    found = await db.scalars(query.order_by(Entry.joined_at, Entry.user_id))
    return list(found)


async def players_of(db: AsyncSession, tournament: Tournament) -> list[uuid.UUID]:
    return await _players(db, tournament)


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
    # One join at a time per tournament, so two at once cannot pass its size.
    await db.execute(select(Tournament.id).where(Tournament.id == tournament.id).with_for_update())
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
    await db.flush()
    if len(await _players(db, tournament)) > tournament.max_players:  # a join landed meanwhile
        await db.rollback()
        raise AppError(409, "tournament_full", "This tournament is full.")
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


def _add_round(
    db: AsyncSession, tournament: Tournament, records: list[swiss.Record]
) -> list[Pairing]:
    """Pair the next round and add its pairings (and bye)."""
    pairs, bye = swiss.pair(records)
    added = [
        Pairing(
            id=uuid.uuid4(),
            tournament_id=tournament.id,
            round=tournament.round,
            goat_id=goat,
            tiger_id=tiger,
        )
        for goat, tiger in pairs
    ]
    if bye is not None:
        added.append(
            Pairing(
                id=uuid.uuid4(),
                tournament_id=tournament.id,
                round=tournament.round,
                goat_id=bye,
                tiger_id=None,
            )
        )
    db.add_all(added)
    return added


async def start(db: AsyncSession, now: datetime, user_id: uuid.UUID, code: str) -> Tournament:
    """Close entries, set the number of rounds and pair round 1 (by rating)."""
    tournament = await find(db, code)
    _hosted(tournament, user_id)
    if tournament.status != TournamentStatus.OPEN:
        raise AppError(409, "tournament_started", "This tournament has already started.")
    players = await _players(db, tournament)
    if len(players) < MIN_PLAYERS:
        raise AppError(
            409,
            "not_enough_players",
            "A tournament needs at least {count} players.",
            count=MIN_PLAYERS,
        )
    ratings = await _ratings(db, tournament, players)
    claimed = await db.execute(  # pressed twice (two devices): round 1 is drawn up once
        update(Tournament)
        .where(Tournament.id == tournament.id, Tournament.status == TournamentStatus.OPEN)
        .values(status=TournamentStatus.RUNNING, started_at=now)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise AppError(409, "tournament_started", "This tournament has already started.")
    tournament.rounds, tournament.round = swiss.rounds_for(len(players)), 1
    tournament.status, tournament.started_at = TournamentStatus.RUNNING, now
    blocks = await _blocks(db, players)
    _add_round(
        db,
        tournament,
        [
            swiss.Record(uid, 0, ratings.get(uid, 1500.0), opponents=blocks.get(uid, set()))
            for uid in players
        ],
    )
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


def _pairing_state(p: Pairing, found: dict[uuid.UUID, Game]) -> PairingState:
    if p.tiger_id is None or p.forfeit_to is not None:
        return PairingState.DONE  # a bye, or won without a game
    return state_of(None if p.game_id is None else found.get(p.game_id))


async def play(  # noqa: PLR0913, PLR0917 - who asks for which pairing of which tournament
    db: AsyncSession,
    presence: Presence,
    now: datetime,
    user: User,
    code: str,
    pairing_id: uuid.UUID,
) -> Challenge:
    """ "Play now": challenge the opponent (who must be online) to this pairing's game; their
    accepting it starts the game."""
    tournament = await find(db, code)
    if tournament.status != TournamentStatus.RUNNING:
        raise AppError(409, "tournament_not_running", "This tournament is not being played.")
    pairing = await db.get(Pairing, pairing_id)
    if pairing is None or pairing.tournament_id != tournament.id:
        raise AppError(404, "pairing_not_found", "No such game in this tournament.")
    if user.id not in (pairing.goat_id, pairing.tiger_id):
        raise AppError(403, "not_your_game", "This is not your game.")
    await check_waiting(db, pairing)
    opponent_id = pairing.tiger_id if user.id == pairing.goat_id else pairing.goat_id
    assert opponent_id is not None  # noqa: S101 - not a bye (checked)
    if await lobby.has_blocked(db, user.id, opponent_id) or await lobby.has_blocked(
        db, opponent_id, user.id
    ):
        raise AppError(
            403, "player_blocked", "One of you has blocked the other: the host decides this game."
        )
    if not await presence.online([opponent_id]):
        raise AppError(409, "player_offline", "Your opponent is not online.")
    opponent = await db.get(User, opponent_id)
    assert opponent is not None  # noqa: S101 - entries go with their players
    await lobby.check_abort_cooldown(db, user.id, now)
    await lobby.check_abort_cooldown(db, opponent.id, now, name=opponent.username)
    await lobby.check_free(db, user.id, opponent.id)
    tc = TIME_CONTROLS[tournament.time_control]
    challenge = Challenge(
        id=uuid.uuid4(),
        challenger_id=user.id,
        opponent_id=opponent.id,
        pair_key=lobby.pair_key(user.id, opponent.id),
        initial_seconds=tc.initial_seconds,
        increment_seconds=tc.increment_seconds,
        rated=False,
        challenger_side="goat" if user.id == pairing.goat_id else "tiger",
        status=ChallengeStatus.PENDING,
        created_at=now,
        expires_at=now + lobby.CHALLENGE_TTL,
        pairing_id=pairing.id,
    )
    return await lobby.send_challenge(db, now, challenge, opponent.username)


def _winner(p: Pairing, game: Game) -> uuid.UUID | None:
    """Who won the pairing's game: None for a draw."""
    if games.drawn(game):
        return None
    return p.goat_id if game.winner == "goat" else p.tiger_id


async def _played(
    db: AsyncSession, tournament: Tournament
) -> tuple[list[Pairing], dict[uuid.UUID, Game], dict[uuid.UUID, PairingState]]:
    """Every pairing (newest round first), the games played for them, and where each stands."""
    pairings = list(
        await db.scalars(
            select(Pairing)
            .where(Pairing.tournament_id == tournament.id)
            .order_by(Pairing.round.desc(), Pairing.id)
            .execution_options(populate_existing=True)
        )
    )
    game_ids = [p.game_id for p in pairings if p.game_id is not None]
    found = {g.id: g for g in await db.scalars(select(Game).where(Game.id.in_(game_ids)))}
    return pairings, found, {p.id: _pairing_state(p, found) for p in pairings}


async def _blocks(db: AsyncSession, players: list[uuid.UUID]) -> dict[uuid.UUID, set[uuid.UUID]]:
    """Who each player has a block with (either way): kept apart when pairing, if it can be."""
    rows = await db.execute(
        select(Block.blocker_id, Block.blocked_id).where(
            Block.blocker_id.in_(players), Block.blocked_id.in_(players)
        )
    )
    apart: dict[uuid.UUID, set[uuid.UUID]] = {}
    for a, b in rows.all():
        apart.setdefault(a, set()).add(b)
        apart.setdefault(b, set()).add(a)
    return apart


@dataclass(frozen=True)
class Step:
    """A tournament moved on: the next round paired (its pairings and bye), or it ended."""

    tournament: Tournament
    pairings: list[Pairing]
    """Empty when it ended."""


async def advance(db: AsyncSession, now: datetime, tournament: Tournament) -> Step | None:
    """When the round being played is over, pair the next (or, after the last, or with fewer
    than two players left, end the tournament). Once, however many ask at once."""
    if tournament.status != TournamentStatus.RUNNING:
        return None
    pairings, found, states = await _played(db, tournament)
    current = [p for p in pairings if p.round == tournament.round]
    if not current or any(states[p.id] != PairingState.DONE for p in current):
        return None
    playing = await _players(db, tournament, playing=True)
    more = tournament.round < tournament.rounds and len(playing) >= 2
    records = None
    if more:
        everyone = await _players(db, tournament)
        ratings = await _ratings(db, tournament, everyone)
        apart = await _blocks(db, playing)
        records = [r for r in _records(pairings, found, everyone, ratings) if r.id in set(playing)]
        for r in records:
            r.opponents |= apart.get(r.id, set())
    claimed = await db.execute(
        update(Tournament)
        .where(
            Tournament.id == tournament.id,
            Tournament.round == tournament.round,
            Tournament.status == TournamentStatus.RUNNING,
        )
        .values(
            {"round": tournament.round + 1}
            if more
            else {"status": TournamentStatus.FINISHED, "finished_at": now}
        )
        .execution_options(synchronize_session=False)  # set below, as claimed
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()  # another request moved it on first
        return None
    added: list[Pairing] = []
    if records is not None:
        tournament.round += 1
        added = _add_round(db, tournament, records)
    else:
        tournament.status, tournament.finished_at = TournamentStatus.FINISHED, now
    await db.commit()
    return Step(tournament, added)


async def of_game(db: AsyncSession, game_id: uuid.UUID) -> Tournament | None:
    """The running tournament a game was played for, if any."""
    return await db.scalar(
        select(Tournament)
        .join(Pairing, Pairing.tournament_id == Tournament.id)
        .where(Pairing.game_id == game_id, Tournament.status == TournamentStatus.RUNNING)
    )


async def award(
    db: AsyncSession, user_id: uuid.UUID, code: str, pairing_id: uuid.UUID, winner: str
) -> Tournament:
    """The host gives a game nobody has started to the player who turned up (``goat`` or
    ``tiger``), so the round can move on."""
    tournament = await find(db, code)
    _hosted(tournament, user_id)
    if tournament.status != TournamentStatus.RUNNING:
        raise AppError(409, "tournament_not_running", "This tournament is not being played.")
    pairing = await db.get(Pairing, pairing_id)
    if pairing is None or pairing.tournament_id != tournament.id:
        raise AppError(404, "pairing_not_found", "No such game in this tournament.")
    if pairing.round != tournament.round or pairing.tiger_id is None:
        raise AppError(409, "pairing_played", "Only this round's games can be given.")
    game = None if pairing.game_id is None else await db.get(Game, pairing.game_id)
    if pairing.forfeit_to is not None or state_of(game) != PairingState.WAITING:
        raise AppError(409, "pairing_played", "This game has been played, or is being played.")
    given = await db.execute(
        update(Pairing)
        .where(Pairing.id == pairing.id, Pairing.forfeit_to.is_(None), unstarted(pairing))
        .values(forfeit_to=pairing.goat_id if winner == "goat" else pairing.tiger_id)
    )
    if given.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise AppError(409, "pairing_played", "This game has just been started.")
    await db.commit()
    return tournament


async def _forfeit_waiting(
    db: AsyncSession, tournament: Tournament, loser: uuid.UUID, only_against: uuid.UUID | None
) -> bool:
    """Give this round's unplayed games of ``loser`` to their opponents (only the one against
    ``only_against``, if given); whether any was given."""
    pairings, _, states = await _played(db, tournament)
    given = False
    for p in pairings:
        if p.round != tournament.round or states[p.id] != PairingState.WAITING:
            continue
        if loser not in (p.goat_id, p.tiger_id):
            continue
        winner = p.tiger_id if loser == p.goat_id else p.goat_id
        if only_against is not None and winner != only_against:
            continue
        p.forfeit_to = winner
        given = True
    return given


async def _running_with(db: AsyncSession, user_id: uuid.UUID) -> list[Tournament]:
    return list(
        await db.scalars(
            select(Tournament)
            .join(Entry, Entry.tournament_id == Tournament.id)
            .where(
                Entry.user_id == user_id,
                Entry.withdrawn_at.is_(None),
                Tournament.status == TournamentStatus.RUNNING,
            )
        )
    )


async def withdraw(db: AsyncSession, now: datetime, user_id: uuid.UUID) -> list[Tournament]:
    """A player leaves for good (account deleted, or banned): out of tournaments not started,
    and in running ones paired no more, this round's unplayed games going to their opponents.
    The tournaments that changed."""
    await db.execute(
        delete(Entry).where(
            Entry.user_id == user_id,
            Entry.tournament_id.in_(
                select(Tournament.id).where(
                    Tournament.status == TournamentStatus.OPEN, Tournament.host_id != user_id
                )
            ),
        )
    )
    running = await _running_with(db, user_id)
    for tournament in running:
        entry = await db.get(Entry, (tournament.id, user_id))
        assert entry is not None  # noqa: S101 - found through it
        entry.withdrawn_at = now
        await _forfeit_waiting(db, tournament, user_id, None)
    await db.commit()
    return running


async def blocked(
    db: AsyncSession, blocker_id: uuid.UUID, blocked_id: uuid.UUID
) -> list[Tournament]:
    """A block between two players due to meet this round: the game goes to the one blocked
    (who did nothing to lose it). The tournaments that changed."""
    changed = [
        t
        for t in await _running_with(db, blocker_id)
        if await _forfeit_waiting(db, t, blocker_id, blocked_id)
    ]
    await db.commit()
    return changed


async def describe(db: AsyncSession, now: datetime, tournament: Tournament) -> TournamentOut:
    """The tournament as it stands."""
    players = await _players(db, tournament)
    pairings, found, states = await _played(db, tournament)

    people = {tournament.host_id, *players}
    names = dict(
        (await db.execute(select(User.id, User.username).where(User.id.in_(people)))).all()
    )

    def who(uid: uuid.UUID) -> PlayerOut:
        return PlayerOut(id=uid, username=names[uid])

    points = dict.fromkeys(players, 0.0)
    played = dict.fromkeys(players, 0)
    met: dict[uuid.UUID, list[uuid.UUID]] = {uid: [] for uid in players}
    out_pairings, byes = [], []
    for p in pairings:
        if p.tiger_id is None:
            points[p.goat_id] += 1
            byes.append(ByeOut(round=p.round, player=who(p.goat_id)))
            continue
        game = None if p.game_id is None else found.get(p.game_id)
        winner = p.forfeit_to
        if winner is not None:
            points[winner] += 1  # won without a game: a point, but no opponent met
        elif states[p.id] == PairingState.DONE:
            assert game is not None  # noqa: S101 - done means a finished game
            winner = _winner(p, game)
            for uid in (p.goat_id, p.tiger_id):
                points[uid] += games.points(game, uid)
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
                game_id=(
                    p.game_id
                    if states[p.id] != PairingState.WAITING and p.forfeit_to is None
                    else None
                ),
                winner=None if winner is None else who(winner),
                forfeit=p.forfeit_to is not None,
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
    played: dict[uuid.UUID, Game],
    players: list[uuid.UUID],
    ratings: dict[uuid.UUID, float],
) -> list[swiss.Record]:
    """Where each player stands after the rounds played, for pairing the next."""
    records = {uid: swiss.Record(uid, 0.0, ratings.get(uid, 1500.0)) for uid in players}
    for p in sorted(pairings, key=lambda p: p.round):
        if p.tiger_id is None:
            records[p.goat_id].score += 1
            records[p.goat_id].had_bye = True
            continue
        goat, tiger = records[p.goat_id], records[p.tiger_id]
        goat.opponents.add(tiger.id)
        tiger.opponents.add(goat.id)
        if p.forfeit_to is not None:  # a point to the winner; no sides played
            records[p.forfeit_to].score += 1
            continue
        goat.goats, goat.last_side = goat.goats + 1, "goat"
        tiger.tigers, tiger.last_side = tiger.tigers + 1, "tiger"
        # The rounds played are over: every game in them has a result (a win, or a draw).
        game = played[cast(uuid.UUID, p.game_id)]
        goat.score += games.points(game, goat.id)
        tiger.score += games.points(game, tiger.id)
    return list(records.values())
