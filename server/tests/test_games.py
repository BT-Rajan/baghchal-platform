import asyncio
import uuid
from contextlib import AsyncExitStack
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx_ws import AsyncWebSocketSession

from baghchal_engine import Game as EngineGame
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.games import service as game_service
from baghchal_server.games import sweeper
from baghchal_server.games.schemas import MoveIn
from baghchal_server.games.service import ABANDON_AFTER, FIRST_MOVE_GRACE

from .conftest import Clock, Player, PlayerFactory, open_socket

# Tigers take a goat on every turn: a whole game in ten moves.
FIVE_CAPTURES = ["b2", "a1xc3", "e2", "e1xe3", "c4", "c3xc5", "b4", "c5xa3", "b2", "a3xc1"]


async def _event(ws: AsyncWebSocketSession, kind: str) -> dict[str, Any]:
    """The next event of this kind (skipping others)."""
    while True:
        message: dict[str, Any] = await asyncio.wait_for(ws.receive_json(), timeout=2)
        if message["type"] == kind:
            return message


async def _online(
    app: FastAPI, stack: AsyncExitStack, *people: Player
) -> list[AsyncWebSocketSession]:
    sockets = []
    for p in people:
        ws = await stack.enter_async_context(open_socket(app, p.auth))
        await _event(ws, "hello")
        sockets.append(ws)
    return sockets


async def _start(goat: Player, tiger: Player, time_control: str = "5+3") -> dict[str, Any]:
    """``goat`` challenges ``tiger`` (who must be online) as goat; ``tiger`` accepts."""
    r = await goat.http.post(
        "/api/v1/challenges",
        json={"opponent": tiger.username, "time_control": time_control, "side": "goat"},
    )
    assert r.status_code == 201, r.text
    r = await tiger.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
    assert r.status_code == 200, r.text
    game: dict[str, Any] = (await tiger.http.get(f"/api/v1/games/{r.json()['game_id']}")).json()
    return game


async def _move(player: Player, game: dict[str, Any], move: str) -> httpx.Response:
    return await player.http.post(
        f"/api/v1/games/{game['id']}/moves", json={"ply": game["ply"], "move": move}
    )


async def _play(
    goat: Player, tiger: Player, game: dict[str, Any], moves: list[str]
) -> dict[str, Any]:
    for move in moves:
        mover = goat if game["side_to_move"] == "goat" else tiger
        r = await _move(mover, game, move)
        assert r.status_code == 200, r.text
        game = r.json()
    return game


@pytest.fixture
async def pair(app: FastAPI, players: PlayerFactory) -> tuple[Player, Player]:
    return await players("alice"), await players("bob")


# ── Starting ──────────────────────────────────────────────────────────────


async def test_accepting_starts_a_game(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        alice_ws, bob_ws = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        for ws in (alice_ws, bob_ws):
            assert (await _event(ws, "challenge"))["challenge"]["status"] == "pending"
            accepted = (await _event(ws, "challenge"))["challenge"]
            assert accepted["status"] == "accepted"
            assert accepted["game_id"] == game["id"]
            assert (await _event(ws, "game"))["game"] == game

    assert game["goat"] == {"id": alice.id, "username": "alice"}
    assert game["tiger"] == {"id": bob.id, "username": "bob"}
    assert game["status"] == "active"
    assert game["result"] is None
    assert game["position"] == "T3T/5/5/5/T3T g 20 0"
    assert (game["ply"], game["side_to_move"], game["moves"]) == (0, "goat", [])
    assert len(game["legal_moves"]) == 21
    assert game["clocks"] == {"goat_ms": 300_000, "tiger_ms": 300_000, "running": None}
    assert game["time_control"] == "5+3"
    assert game["rated"] is False


async def test_sides_are_assigned_for_random_and_rated(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob, carol)
        for opponent, extra in ((bob, {"rated": True}), (carol, {"side": "tiger"})):
            challenger = alice if opponent is bob else carol
            target = bob if opponent is bob else alice
            await _online(app, stack, target) if target is alice else None
            r = await challenger.http.post(
                "/api/v1/challenges",
                json={"opponent": target.username, "time_control": "3+2", **extra},
            )
            assert r.status_code == 201, r.text
            game_id = (
                await target.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
            ).json()["game_id"]
            game = (await target.http.get(f"/api/v1/games/{game_id}")).json()
            assert {game["goat"]["id"], game["tiger"]["id"]} == {challenger.id, target.id}
            if extra.get("side") == "tiger":
                assert game["tiger"]["id"] == challenger.id
            # finish so the players are free again
            await target.http.post(f"/api/v1/games/{game_id}/abort")


async def test_one_live_game_per_player(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob, carol)
        # Carol challenges Bob before Bob's game with Alice starts.
        pending = await carol.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "5+3"}
        )
        game = await _start(alice, bob)
        r = await bob.http.post(f"/api/v1/challenges/{pending.json()['id']}/accept")
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "player_busy"
        # The failed accept changed nothing: the challenge is still open.
        assert [c["id"] for c in (await bob.http.get("/api/v1/challenges")).json()["incoming"]] == [
            pending.json()["id"]
        ]
        for challenger, opponent in ((carol, "alice"), (alice, "carol")):
            r = await challenger.http.post(
                "/api/v1/challenges", json={"opponent": opponent, "time_control": "5+3"}
            )
            assert r.json()["error"]["code"] == "player_busy"
        profile = (await carol.http.get("/api/v1/players/alice")).json()
        assert profile["playing"] is True

        await alice.http.post(f"/api/v1/games/{game['id']}/abort")
        assert (await carol.http.get("/api/v1/players/alice")).json()["playing"] is False


# ── Moves ─────────────────────────────────────────────────────────────────


async def test_a_full_game_to_five_captures(app: FastAPI, pair: tuple[Player, Player]) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        alice_ws, _ = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        game = await _play(alice, bob, game, FIVE_CAPTURES)
        assert game["status"] == "finished"
        assert game["result"] == {"winner": "tiger", "reason": "five_captured"}
        assert game["moves"] == FIVE_CAPTURES
        assert game["legal_moves"] == []
        assert game["deadline_at"] is None
        # Alice saw every step live, ending with the result.
        last = None
        while last is None or last["status"] != "finished":
            last = (await _event(alice_ws, "game"))["game"]
        assert last == game
        assert (await alice.http.get("/api/v1/games")).json() == []


async def test_move_validation(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob, carol = await players("alice"), await players("bob"), await players("carol")
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        url = f"/api/v1/games/{game['id']}/moves"
        cases = [
            (bob, {"ply": 0, "move": "c3"}, 409, "not_your_turn"),
            (carol, {"ply": 0, "move": "c3"}, 403, "not_a_player"),
            (alice, {"ply": 1, "move": "c3"}, 409, "stale_position"),
            (alice, {"ply": 0, "move": "z9"}, 422, "invalid_move"),
            (alice, {"ply": 0, "move": "a1"}, 422, "illegal_move"),  # a tiger stands there
            (alice, {"ply": 0, "move": "a2-a3"}, 422, "illegal_move"),  # goats must place first
            (alice, {"ply": 0, "move": "c3", "x": 1}, 422, "invalid_request"),
            (alice, {"ply": -1, "move": "c3"}, 422, "invalid_request"),
        ]
        for who, body, status, code in cases:
            r = await who.http.post(url, json=body)
            assert (r.status_code, r.json()["error"]["code"]) == (status, code), body
        r = await alice.http.post(
            "/api/v1/games/00000000-0000-0000-0000-000000000000/moves",
            json={"ply": 0, "move": "c3"},
        )
        assert r.status_code == 404
        # Nothing above changed the game.
        assert (await alice.http.get(f"/api/v1/games/{game['id']}")).json()["ply"] == 0
        assert (await _move(alice, game, "c3")).status_code == 200


async def test_the_same_move_twice_at_once_counts_once(
    app: FastAPI, pair: tuple[Player, Player]
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        results = await asyncio.gather(_move(alice, game, "c3"), _move(alice, game, "b2"))
        assert sorted(r.status_code for r in results) == [200, 409]
        game = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert game["ply"] == 1
        assert len(game["moves"]) == 1


async def test_moves_survive_a_cold_cache(app: FastAPI, pair: tuple[Player, Player]) -> None:
    """Any server can serve any game: the engine state is rebuilt from the stored moves."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        game = await _play(alice, bob, game, FIVE_CAPTURES[:4])
        game_service._cache.clear()
        game = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert game["moves"] == FIVE_CAPTURES[:4]
        game_service._cache.clear()
        game = await _play(alice, bob, game, FIVE_CAPTURES[4:])
        assert game["result"]["reason"] == "five_captured"


# ── Clocks ────────────────────────────────────────────────────────────────


async def test_clocks(app: FastAPI, pair: tuple[Player, Player], clock: Clock) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "3+2")
        # First moves are free: clocks start after each side's first move.
        clock.advance(seconds=20)
        game = await _play(alice, bob, game, ["c3"])
        clock.advance(seconds=20)
        game = await _play(alice, bob, game, ["a1-b2"])
        assert game["clocks"] == {"goat_ms": 180_000, "tiger_ms": 180_000, "running": "goat"}
        # From now on the side to move is charged, then gets the increment.
        clock.advance(seconds=10)
        mid = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert mid["clocks"] == {"goat_ms": 170_000, "tiger_ms": 180_000, "running": "goat"}
        game = await _play(alice, bob, game, ["c2"])
        assert game["clocks"] == {"goat_ms": 172_000, "tiger_ms": 180_000, "running": "tiger"}
        assert game["deadline_at"].startswith("2026-01-01T12:03:50")  # 12:00:50 + 180 s


async def test_no_first_move_aborts_the_game(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    state = app.state.ctx
    async with AsyncExitStack() as stack:
        alice_ws, _ = await _online(app, stack, alice, bob)
        game = await _start(alice, bob)
        clock.advance(seconds=FIRST_MOVE_GRACE.total_seconds() - 1)
        assert await sweeper.sweep(state) == 0
        clock.advance(seconds=1)
        assert await sweeper.sweep(state) == 1
        assert await sweeper.sweep(state) == 0  # exactly once
        ended = None
        while ended is None or ended["status"] != "finished":
            ended = (await _event(alice_ws, "game"))["game"]
        assert ended["result"] == {"winner": None, "reason": "aborted"}
        assert ended["id"] == game["id"]
        # Both players are free to play again.
        r = await alice.http.post(
            "/api/v1/challenges", json={"opponent": "bob", "time_control": "5+3"}
        )
        assert r.status_code == 201


async def test_running_out_of_time_loses(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "3+2")
        game = await _play(alice, bob, game, ["c3", "a1-b2", "c2"])
        clock.advance(seconds=180)  # tiger's whole clock
        # Seen on the next read, even before the sweeper runs.
        game = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert game["result"] == {"winner": "goat", "reason": "timeout"}
        assert game["clocks"]["tiger_ms"] == 0
        assert game["clocks"]["running"] is None


async def test_a_move_after_the_flag_is_refused(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "3+2")
        game = await _play(alice, bob, game, ["c3", "a1-b2"])
        clock.advance(seconds=181)
        r = await _move(alice, game, "c2")
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "game_over"
        game = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
        assert game["result"] == {"winner": "tiger", "reason": "timeout"}


async def test_last_moment_flag_race(
    pair: tuple[Player, Player], clock: Clock, app: FastAPI
) -> None:
    """If the deadline passes between settling and playing, the move is still refused."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "3+2")
        game = await _play(alice, bob, game, ["c3", "a1-b2"])
        state = app.state.ctx
        clock.advance(seconds=181)
        async with state.sessions() as db:
            with pytest.raises(AppError) as info:
                await game_service.play(
                    db,
                    uuid.UUID(game["id"]),
                    uuid.UUID(alice.id),
                    MoveIn(ply=2, move="c2"),
                    clock(),
                )
        assert info.value.code == "game_over"


async def test_background_sweeper(
    settings: Settings,
    app: FastAPI,
    pair: tuple[Player, Player],
    clock: Clock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        clock.advance(seconds=31)
        monkeypatch.setattr(sweeper, "SWEEP_INTERVAL", 0.01)
        task = asyncio.create_task(sweeper.run(app.state.ctx))
        try:
            for _ in range(200):
                if (await alice.http.get(f"/api/v1/games/{game['id']}")).json()[
                    "status"
                ] == "finished":
                    break
                await asyncio.sleep(0.01)
        finally:
            task.cancel()
        assert (await alice.http.get(f"/api/v1/games/{game['id']}")).json()["result"][
            "reason"
        ] == "aborted"


async def test_sweeper_survives_errors(app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    async def broken(state: object) -> int:
        nonlocal calls
        calls += 1
        raise RuntimeError("database down")

    monkeypatch.setattr(sweeper, "sweep", broken)
    monkeypatch.setattr(sweeper, "SWEEP_INTERVAL", 0.01)
    task = asyncio.create_task(sweeper.run(app.state.ctx))
    await asyncio.sleep(0.05)
    task.cancel()
    assert calls >= 2


async def test_concurrent_sweeps_end_a_game_once(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        await _start(alice, bob)
        clock.advance(seconds=31)
        counts = await asyncio.gather(*(sweeper.sweep(app.state.ctx) for _ in range(4)))
        assert sum(counts) == 1


# ── Resigning, aborting, abandoning ───────────────────────────────────────


async def test_resign(app: FastAPI, pair: tuple[Player, Player]) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        game = await _play(alice, bob, game, ["c3", "a1-b2"])
        r = await bob.http.post(f"/api/v1/games/{game['id']}/resign")
        assert r.status_code == 200
        assert r.json()["result"] == {"winner": "goat", "reason": "resigned"}
        r = await alice.http.post(f"/api/v1/games/{game['id']}/resign")
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "game_over"
        assert (await _move(alice, r.json() | {"id": game["id"], "ply": 2}, "c2")).json()["error"][
            "code"
        ] == "game_over"


async def test_abort_only_before_both_sides_move(app: FastAPI, pair: tuple[Player, Player]) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        game = await _play(alice, bob, game, ["c3", "a1-b2"])
        r = await alice.http.post(f"/api/v1/games/{game['id']}/abort")
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "cannot_abort"
        await alice.http.post(f"/api/v1/games/{game['id']}/resign")


async def test_claiming_an_abandoned_game(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice)
        bob_socket = AsyncExitStack()
        await _online(app, bob_socket, bob)
        game = await _start(alice, bob, "15+10")
        game = await _play(alice, bob, game, ["c3", "a1-b2", "c2"])  # bob (tiger) to move
        url = f"/api/v1/games/{game['id']}/claim-abandonment"

        async def claim(who: Player) -> str:
            code: str = (await who.http.post(url)).json()["error"]["code"]
            return code

        wait = ABANDON_AFTER.total_seconds()
        clock.advance(seconds=wait)
        assert await claim(alice) == "cannot_claim"  # bob is still connected
        await bob_socket.aclose()  # bob leaves
        assert await claim(bob) == "cannot_claim"  # it is bob's own turn
        assert await claim(alice) == "cannot_claim"  # bob only just left; he may be back
        clock.advance(seconds=wait - 1)
        assert await claim(alice) == "cannot_claim"
        clock.advance(seconds=1)  # bob has now been gone for the whole wait
        r = await alice.http.post(url)
        assert r.status_code == 200
        assert r.json()["result"] == {"winner": "goat", "reason": "abandoned"}


async def test_a_connection_that_blinks_does_not_count_as_leaving(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    """A weak connection drops and comes back; the wait starts again from the last drop."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice)
        bob_socket = AsyncExitStack()
        await _online(app, bob_socket, bob)
        game = await _start(alice, bob, "15+10")
        game = await _play(alice, bob, game, ["c3", "a1-b2", "c2"])  # bob (tiger) to move
        url = f"/api/v1/games/{game['id']}/claim-abandonment"
        await bob_socket.aclose()
        clock.advance(seconds=40)
        async with AsyncExitStack() as again:  # bob is back for a moment
            await _online(app, again, bob)
            clock.advance(seconds=5)
        clock.advance(seconds=30)  # 75 s on bob's turn, but only 30 s since he was last seen
        assert (await alice.http.post(url)).json()["error"]["code"] == "cannot_claim"
        clock.advance(seconds=30)
        assert (await alice.http.post(url)).json()["result"]["reason"] == "abandoned"


async def test_claiming_against_someone_never_seen_online(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    """A challenger need not be connected; with no record of them, only the turn time counts."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "15+10")  # alice never opens a socket
        game = await _play(alice, bob, game, ["c3", "a1-b2"])  # alice (goat) to move
        clock.advance(seconds=ABANDON_AFTER.total_seconds())
        r = await bob.http.post(f"/api/v1/games/{game['id']}/claim-abandonment")
        assert r.json()["result"] == {"winner": "tiger", "reason": "abandoned"}


async def test_no_claim_before_the_wait_is_over(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob, "15+10")
        url = f"/api/v1/games/{game['id']}/claim-abandonment"
        assert (await alice.http.post(url)).json()["error"]["code"] == "cannot_claim"  # ply 0
        game = await _play(alice, bob, game, ["c3", "a1-b2", "c2"])
    clock.advance(seconds=ABANDON_AFTER.total_seconds() - 1)
    assert (await alice.http.post(url)).json()["error"]["code"] == "cannot_claim"


async def test_ending_retries_when_a_move_lands_first(
    app: FastAPI, pair: tuple[Player, Player], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Resigning re-reads the game if a move changed it meanwhile; it gives up after 3 tries."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        real_finish = game_service._finish
        attempts = 0

        async def always_stale(*args: Any, **kwargs: Any) -> bool:
            nonlocal attempts
            attempts += 1
            return False

        monkeypatch.setattr(game_service, "_finish", always_stale)
        r = await alice.http.post(f"/api/v1/games/{game['id']}/resign")
        assert (r.status_code, r.json()["error"]["code"]) == (409, "stale_position")
        assert attempts == 3
        monkeypatch.setattr(game_service, "_finish", real_finish)
        assert (await alice.http.post(f"/api/v1/games/{game['id']}/resign")).status_code == 200


async def test_my_active_games(app: FastAPI, pair: tuple[Player, Player]) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        game = await _play(alice, bob, game, ["c3"])
        mine = (await alice.http.get("/api/v1/games")).json()
        assert [g["id"] for g in mine] == [game["id"]]
        assert mine[0]["moves"] == ["c3"]
        assert (await bob.http.get("/api/v1/games")).json()[0]["id"] == game["id"]


async def test_engine_state_matches_the_game_as_read(
    app: FastAPI, pair: tuple[Player, Player]
) -> None:
    """A request that read the game before another move was stored judges its move on the
    board it read (and then loses the race), never on the newer board."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
        await _play(alice, bob, game, ["c3"])
        async with app.state.ctx.sessions() as db:
            row = await game_service.get_game(db, uuid.UUID(game["id"]))
            row.ply = 0  # what a slower request read before "c3" was stored
            game_service._cache.clear()
            engine_game = await game_service._engine_game(db, row, take=True)
            assert engine_game.ply == 0
            await db.rollback()


@pytest.mark.parametrize("rival", ["move", "resign"])
async def test_a_rival_change_mid_request_makes_the_move_stale(
    app: FastAPI,
    pair: tuple[Player, Player],
    clock: Clock,
    monkeypatch: pytest.MonkeyPatch,
    rival: str,
) -> None:
    """Another request changes the game after this one read it: this move must lose cleanly,
    whether the rival stored the same ply (duplicate key) or ended the game (no row updated)."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
    state = app.state.ctx
    game_id, alice_id = uuid.UUID(game["id"]), uuid.UUID(alice.id)
    real_engine_game = game_service._engine_game
    raced = False

    async def racing(db: Any, row: Any, *, take: bool = False) -> Any:
        nonlocal raced
        engine_game = await real_engine_game(db, row, take=take)
        if take and not raced:
            raced = True
            async with state.sessions() as other:
                if rival == "move":
                    await game_service.play(
                        other, game_id, alice_id, MoveIn(ply=0, move="c3"), clock()
                    )
                else:
                    await game_service.resign(other, game_id, alice_id, clock())
        return engine_game

    monkeypatch.setattr(game_service, "_engine_game", racing)
    async with state.sessions() as db:
        with pytest.raises(AppError) as info:
            await game_service.play(db, game_id, alice_id, MoveIn(ply=0, move="b2"), clock())
    assert info.value.code == "stale_position"
    monkeypatch.setattr(game_service, "_engine_game", real_engine_game)
    final = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
    assert final["moves"] == (["c3"] if rival == "move" else [])


async def test_sweeper_skips_games_that_are_no_longer_due(
    app: FastAPI, pair: tuple[Player, Player], monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)

    async def stale_list(db: Any, now: Any) -> list[uuid.UUID]:
        return [uuid.UUID(game["id"])]  # as if listed just before a move pushed its deadline

    monkeypatch.setattr(game_service, "due_games", stale_list)
    assert await sweeper.sweep(app.state.ctx) == 0
    assert (await alice.http.get(f"/api/v1/games/{game['id']}")).json()["status"] == "active"


async def test_engine_cache_is_bounded(
    app: FastAPI, pair: tuple[Player, Player], monkeypatch: pytest.MonkeyPatch
) -> None:
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
    monkeypatch.setattr(game_service, "_CACHE_SIZE", 1)
    game_service._cache.clear()
    game_service._cache[uuid.uuid4()] = EngineGame()
    await alice.http.get(f"/api/v1/games/{game['id']}")
    assert list(game_service._cache) == [uuid.UUID(game["id"])]


async def test_a_game_ended_meanwhile_is_not_ended_twice(
    app: FastAPI, pair: tuple[Player, Player], clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The sweeper read an overdue game, but a resignation landed first: it ends nothing."""
    alice, bob = pair
    async with AsyncExitStack() as stack:
        await _online(app, stack, bob)
        game = await _start(alice, bob)
    state = app.state.ctx
    real_expire = game_service.expire

    async def resign_first(db: Any, row: Any, now: Any) -> bool:
        async with state.sessions() as other:
            await game_service.resign(other, row.id, uuid.UUID(alice.id), now)
        return await real_expire(db, row, now)

    monkeypatch.setattr(game_service, "expire", resign_first)
    clock.advance(seconds=31)
    assert await sweeper.sweep(state) == 0
    final = (await alice.http.get(f"/api/v1/games/{game['id']}")).json()
    assert final["result"] == {"winner": "tiger", "reason": "resigned"}
