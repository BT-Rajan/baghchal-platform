import uuid
from datetime import timedelta
from typing import Final

from fastapi import APIRouter, status

from baghchal_engine.ai import Level
from baghchal_server.appearance import service as appearance
from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import Feature
from baghchal_server.deps import DB, AppState, CurrentUser, State, enforce_limit
from baghchal_server.errors import AppError
from baghchal_server.games import analysis, service
from baghchal_server.games import computer as computer_players
from baghchal_server.games.events import notify
from baghchal_server.games.models import GameStatus
from baghchal_server.games.schemas import AnalysisOut, ComputerGameIn, EmoteIn, GameOut, MoveIn
from baghchal_server.lobby import service as lobby
from baghchal_server.lobby.time_controls import TIME_CONTROLS
from baghchal_server.ratelimit import Limit
from baghchal_server.realtime.protocol import EmoteEvent

router = APIRouter(prefix="/api/v1")

# Generous: a 3+2 game is fast, but no human needs more than a few moves a second.
MOVES_PER_USER: Final = Limit("game-move", 300, 60)
COMPUTER_GAMES_PER_USER: Final = Limit("computer-game", 60, 3600)
ANALYSES_PER_USER: Final = Limit("analyse", 60, 3600)
EMOTES_PER_USER: Final = Limit("emote", 20, 60)
EMOTES_AFTER: Final = timedelta(minutes=5)
"""Quick messages can still be sent this long after a game ends ("Well played!")."""
"""Asks for analysis an hour (whatever the plan allows), so nobody can flood the workers."""


async def _settle(state: AppState, db: DB, game_id: uuid.UUID) -> None:
    """End the game now if its deadline has passed (the sweeper would, a moment later)."""
    game = await service.get_game(db, game_id)
    now = state.clock()
    if (
        game.status == GameStatus.ACTIVE
        and game.deadline_at is not None
        and game.deadline_at <= now
        and await service.expire(db, game, now)
    ):
        await notify(state, db, await service.get_game(db, game_id))


@router.get("/games")
async def my_active_games(user: CurrentUser, state: State, db: DB) -> list[GameOut]:
    """Your live games, to resume after a reconnect."""
    now = state.clock()
    return [
        await service.describe(db, g, now, user.id) for g in await service.active_games(db, user.id)
    ]


@router.get("/games/{game_id}")
async def get_game(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    me = user.id  # read first: a rollback (a game settled meanwhile) expires ``user``
    await _settle(state, db, game_id)
    return await service.describe(db, await service.get_game(db, game_id), state.clock(), me)


@router.post("/games/{game_id}/moves")
async def play(
    game_id: uuid.UUID, data: MoveIn, user: CurrentUser, state: State, db: DB
) -> GameOut:
    me = user.id
    await enforce_limit(state, MOVES_PER_USER, str(me))
    await _settle(state, db, game_id)
    game = await service.play(db, game_id, me, data, state.clock(), presence=state.presence)
    out = await notify(state, db, game, me)
    if game.bot_level is not None and game.status == GameStatus.ACTIVE:
        state.computer.schedule(state, game_id)  # its reply
    return out


@router.post("/games/{game_id}/emote", status_code=status.HTTP_204_NO_CONTENT)
async def emote(game_id: uuid.UUID, data: EmoteIn, user: CurrentUser, state: State, db: DB) -> None:
    """A quick message to my opponent, during the game or just after it. It reaches them
    unless they have turned quick messages off, or either has blocked the other (as chat);
    nothing is kept."""
    await enforce_limit(state, EMOTES_PER_USER, str(user.id))
    now = state.clock()
    game = await service.get_game(db, game_id)
    if user.id not in (game.goat_id, game.tiger_id):
        raise AppError(403, "not_your_game", "You are not playing in this game.")
    if game.bot_level is not None:
        raise AppError(409, "nobody_to_hear", "The computer does not read messages.")
    if game.finished_at is not None and now - game.finished_at > EMOTES_AFTER:
        raise AppError(409, "game_over", "This game ended a while ago.")
    side = "goat" if game.goat_id == user.id else "tiger"
    opponent_id = game.tiger_id if side == "goat" else game.goat_id
    blocked = await lobby.has_blocked(db, opponent_id, user.id) or await lobby.has_blocked(
        db, user.id, opponent_id
    )
    if not blocked and (await appearance.mine(db, opponent_id, now)).emotes_on:
        event = EmoteEvent(game_id=game.id, side=side, emote=data.emote)
        await state.hub.send(opponent_id, event.model_dump_json())


@router.post("/games/computer", status_code=status.HTTP_201_CREATED)
async def play_the_computer(
    data: ComputerGameIn, user: CurrentUser, state: State, db: DB
) -> GameOut:
    """Start a casual game against the computer. If it plays goats, it moves first."""
    me = user.id
    await enforce_limit(state, COMPUTER_GAMES_PER_USER, str(me))
    now = state.clock()
    level = Level(data.level)
    if level == Level.HARD:
        await billing.require(db, me, now, Feature.COMPUTER_HARD, "The Hard computer")
    computer = await computer_players.account(db, level, now)
    tc = TIME_CONTROLS[data.time_control]
    game = await service.start_computer_game(
        db,
        now,
        player_id=me,
        computer_id=computer.id,
        level=level.value,
        side=data.side,
        initial_seconds=tc.initial_seconds,
        increment_seconds=tc.increment_seconds,
    )
    out = await notify(state, db, game, me)
    state.computer.schedule(state, game.id)  # moves first when it has the goats
    return out


@router.get("/games/{game_id}/analysis")
async def game_analysis(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> AnalysisOut:
    """A finished game's analysis, once someone has asked for it (Plus and Pro)."""
    return await analysis.read(db, user.id, game_id, state.clock())


@router.post("/games/{game_id}/analysis")
async def analyse_game(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> AnalysisOut:
    """Analyse a finished game: each move against the engine's choice. Plus: 5 new games a
    day; Pro: no limit. A game already analysed costs nothing."""
    await enforce_limit(state, ANALYSES_PER_USER, str(user.id))
    return await analysis.analyse(db, user.id, game_id, state.clock(), state.computer.review)


@router.post("/games/{game_id}/resign")
async def resign(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    me = user.id
    await _settle(state, db, game_id)
    return await notify(state, db, await service.resign(db, game_id, me, state.clock()), me)


@router.post("/games/{game_id}/abort")
async def abort(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    me = user.id
    await _settle(state, db, game_id)
    return await notify(state, db, await service.abort(db, game_id, me, state.clock()), me)


@router.post("/games/{game_id}/draw")
async def offer_draw(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    """Offer a draw, or accept the opponent's open offer (the game ends drawn). Not against the
    computer, and not before both sides have moved."""
    me = user.id
    await _settle(state, db, game_id)
    return await notify(state, db, await service.offer_draw(db, game_id, me, state.clock()), me)


@router.post("/games/{game_id}/draw/decline")
async def decline_draw(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    """Turn down the opponent's draw offer (moving on does the same)."""
    me = user.id
    await _settle(state, db, game_id)
    return await notify(state, db, await service.decline_draw(db, game_id, me), me)


@router.post("/games/{game_id}/claim-abandonment")
async def claim_abandonment(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    me = user.id
    await _settle(state, db, game_id)
    game = await service.claim_abandonment(db, state.presence, game_id, me, state.clock())
    return await notify(state, db, game, me)


@router.post("/games/{game_id}/undo")
async def undo(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    """Take my last move back. Against the computer it happens at once (with the computer's
    reply, if it replied); against a person it asks them (``takeback_offer``). Casual games
    only, after a move of mine, three times a game."""
    me = user.id
    await _settle(state, db, game_id)
    game = await service.undo(db, game_id, me, state.clock())
    return await notify(state, db, game, me)


@router.post("/games/{game_id}/undo/accept")
async def accept_undo(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    """Let my opponent take their last move back (and my reply, if I made one). The clocks
    keep the time each side has; the turn goes back."""
    me = user.id
    await _settle(state, db, game_id)
    game = await service.accept_undo(db, game_id, me, state.clock())
    return await notify(state, db, game, me)


@router.post("/games/{game_id}/undo/decline")
async def decline_undo(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    """Turn down my opponent's takeback request (moving on does the same)."""
    me = user.id
    await _settle(state, db, game_id)
    return await notify(state, db, await service.decline_undo(db, game_id, me), me)
