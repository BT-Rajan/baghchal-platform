"""Load test: many players online at once, playing real games against the API.

Each player signs in, keeps a WebSocket open (answering the server's probes, as the app does)
and plays casual games against a partner: challenge, accept, then random legal moves with a
short pause, until the game ends; then again. It reports how long requests take and how long a
move takes to reach the opponent's socket.

Players are created straight in the database (verified, password ``load-test-password``), so
point it at a test deployment, never at production:

    uv run python tools/loadtest.py seed --players 200          # BAGHCHAL_DATABASE_URL set
    uv run python tools/loadtest.py run --url http://localhost:8000 --players 200 --minutes 2
    uv run python tools/loadtest.py run --url http://a:8000,http://b:8000 --think 2,6 …

Rate limits still apply; from one address, sign-ins are limited (300 per 15 minutes), so keep
``--players`` at or below that or raise the limit on the test deployment.
"""

import argparse
import asyncio
import json
import random
import statistics
import sys
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx
import websockets
from sqlalchemy import select

from baghchal_server.accounts.models import User
from baghchal_server.config import Settings
from baghchal_server.db import create_engine, session_factory
from baghchal_server.security import PasswordHasher

PASSWORD = "load-test-password"  # noqa: S105 - test accounts on a test deployment
PREFIX = "load"
THINK_SECONDS = (0.2, 0.8)
"""Default pause before each move; real blitz players take a few seconds (``--think 2,6``)."""
TIME_CONTROL = "10+5"


# ── Seeding ───────────────────────────────────────────────────────────────


async def seed(players: int) -> None:
    settings = Settings()
    engine = create_engine(settings.database_url, pool_size=2)
    password_hash = await PasswordHasher(1).hash(PASSWORD)
    now = datetime.now(UTC)
    try:
        async with session_factory(engine)() as db:
            existing = set(
                await db.scalars(select(User.username_key).where(User.username_key.like("load%")))
            )
            for i in range(players):
                name = f"{PREFIX}{i:04}"
                if name in existing:
                    continue
                db.add(
                    User(
                        id=uuid.uuid4(),
                        username=name,
                        username_key=name,
                        email=f"{name}@loadtest.invalid",
                        email_key=f"{name}@loadtest.invalid",
                        password_hash=password_hash,
                        email_verified_at=now,
                        is_active=True,
                        role="player",
                        created_at=now,
                        updated_at=now,
                    )
                )
            await db.commit()
    finally:
        await engine.dispose()
    print(f"{players} load-test players ready ({PREFIX}0000…)")


# ── Measuring ─────────────────────────────────────────────────────────────


@dataclass
class Stats:
    latency: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    statuses: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    move_to_opponent: list[float] = field(default_factory=list)
    games: int = 0
    moves: int = 0

    def record(self, label: str, seconds: float, status: int) -> None:
        self.latency[label].append(seconds)
        self.statuses[f"{label} {status}"] += 1

    def report(self, minutes: float) -> str:
        lines = [f"games finished: {self.games}   moves: {self.moves}"]
        lines.append(f"moves per second: {self.moves / (minutes * 60):.1f}")
        lines.append(f"{'request':<22}{'count':>8}{'p50 ms':>9}{'p95 ms':>9}{'p99 ms':>9}")
        for label, values in sorted(self.latency.items()):
            lines.append(
                f"{label:<22}{len(values):>8}"
                + "".join(f"{_ms(values, q):>9}" for q in (50, 95, 99))
            )
        if self.move_to_opponent:
            lines.append(
                f"{'move → opponent socket':<22}{len(self.move_to_opponent):>8}"
                + "".join(f"{_ms(self.move_to_opponent, q):>9}" for q in (50, 95, 99))
            )
        bad = {
            k: v
            for k, v in self.statuses.items()
            if not k.endswith((" 200", " 201", " 202", " 204"))
        }
        lines.append(f"unexpected answers: {dict(bad) or 'none'}")
        return "\n".join(lines)


def _ms(values: list[float], q: int) -> str:
    if len(values) < 2:
        return f"{values[0] * 1000:.0f}" if values else "-"
    return f"{statistics.quantiles(values, n=100)[q - 1] * 1000:.0f}"


# ── Players ───────────────────────────────────────────────────────────────


class Player:
    def __init__(
        self, url: str, name: str, stats: Stats, think: tuple[float, float] = THINK_SECONDS
    ) -> None:
        self.url, self.name, self.stats, self.think = url, name, stats, think
        self.http = httpx.AsyncClient(base_url=url, timeout=30)
        self.events: asyncio.Queue[dict[str, object]] = asyncio.Queue()
        self.sent_at: dict[tuple[str, int], float] = {}
        self.token = ""

    async def call(self, label: str, method: str, path: str, **kwargs: object) -> httpx.Response:
        """Send a request and record how long it took; a dropped connection counts as 599."""
        start = time.perf_counter()
        try:
            r = await self.http.request(method, path, **kwargs)  # type: ignore[arg-type]
        except httpx.TransportError:
            r = httpx.Response(599, json={})
        self.stats.record(label, time.perf_counter() - start, r.status_code)
        return r

    async def sign_in(self) -> None:
        r = await self.call(
            "POST sign-in",
            "POST",
            "/api/v1/auth/login",
            json={"login": self.name, "password": PASSWORD, "transport": "bearer"},
        )
        r.raise_for_status()
        self.token = r.json()["token"]
        self.http.headers["authorization"] = f"Bearer {self.token}"

    async def listen(self, opponent_sent: dict[tuple[str, int], float]) -> None:
        ws_url = self.url.replace("http", "ws", 1) + "/api/v1/ws"
        headers = {"authorization": f"Bearer {self.token}"}
        async with websockets.connect(ws_url, additional_headers=headers) as ws:
            while True:
                message = json.loads(await ws.recv())
                if message["type"] == "probe":
                    await ws.send(json.dumps({"type": "probe", "id": message["id"]}))
                elif message["type"] == "game":
                    game = message["game"]
                    sent = opponent_sent.pop((game["id"], game["ply"]), None)
                    if sent is not None:
                        self.stats.move_to_opponent.append(time.perf_counter() - sent)
                    await self.events.put(game)

    async def wait_for(self, game_id: str, after_ply: int) -> dict[str, object]:
        """The next state of this game newer than ``after_ply`` (or finished)."""
        while True:
            game = await self.events.get()
            if game["id"] == game_id and (
                int(game["ply"]) > after_ply or game["status"] != "active"  # type: ignore[call-overload]
            ):
                return game


async def series(goat: Player, tiger: Player, until: float) -> None:
    """Games between two players, goat challenging and tiger accepting, until time is up."""
    while time.perf_counter() < until:
        r = await goat.call(
            "POST challenge",
            "POST",
            "/api/v1/challenges",
            json={"opponent": tiger.name, "time_control": TIME_CONTROL, "side": "goat"},
        )
        if r.status_code != 201:
            await asyncio.sleep(1)
            continue
        r = await tiger.call("POST accept", "POST", f"/api/v1/challenges/{r.json()['id']}/accept")
        if r.status_code != 200:
            continue
        game_id = r.json()["game_id"]
        await asyncio.gather(
            _side(goat, game_id, "goat", until), _side(tiger, game_id, "tiger", until)
        )
        goat.stats.games += 1


async def _side(p: Player, game_id: str, side: str, until: float) -> None:
    """Play one side: wait for my turn, think, move; resign when time is up."""
    game: dict[str, object] = (await p.call("GET game", "GET", f"/api/v1/games/{game_id}")).json()
    while game["status"] == "active":
        if game["side_to_move"] != side:
            game = await p.wait_for(game_id, int(game["ply"]))  # type: ignore[call-overload]
            continue
        if time.perf_counter() > until:
            await p.call("POST resign", "POST", f"/api/v1/games/{game_id}/resign")
            return
        await asyncio.sleep(random.uniform(*p.think))  # noqa: S311 - not security
        ply = int(game["ply"])  # type: ignore[call-overload]
        p.sent_at[(game_id, ply + 1)] = time.perf_counter()
        r = await p.call(
            "POST move",
            "POST",
            f"/api/v1/games/{game_id}/moves",
            json={"ply": ply, "move": random.choice(game["legal_moves"])},  # type: ignore[arg-type]  # noqa: S311
        )
        if r.status_code != 200:
            game = (await p.call("GET game", "GET", f"/api/v1/games/{game_id}")).json()
            continue
        p.stats.moves += 1
        game = r.json()


async def run(urls: list[str], players: int, minutes: float, think: tuple[float, float]) -> None:
    """Players are spread over ``urls`` in turn, so with several servers each game's two
    players sit on different servers and every move crosses Redis."""
    stats = Stats()
    everyone = [
        Player(urls[i % len(urls)], f"{PREFIX}{i:04}", stats, think)
        for i in range(players - players % 2)
    ]
    for batch in range(0, len(everyone), 20):  # sign in gradually, as people arrive
        await asyncio.gather(*(p.sign_in() for p in everyone[batch : batch + 20]))
    listeners = []
    for a, b in zip(everyone[::2], everyone[1::2], strict=True):
        listeners.append(asyncio.create_task(a.listen(b.sent_at)))
        listeners.append(asyncio.create_task(b.listen(a.sent_at)))
    await asyncio.sleep(2)  # sockets open and presence recorded
    until = time.perf_counter() + minutes * 60
    print(f"{len(everyone)} players signed in; playing for {minutes:g} min…")
    await asyncio.gather(
        *(series(a, b, until) for a, b in zip(everyone[::2], everyone[1::2], strict=True))
    )
    for task in listeners:
        task.cancel()
    await asyncio.gather(*listeners, return_exceptions=True)
    await asyncio.gather(*(p.http.aclose() for p in everyone))
    print(stats.report(minutes))


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    s = commands.add_parser("seed", help="create the load-test players in the database")
    s.add_argument("--players", type=int, default=100)
    r = commands.add_parser("run", help="play games against a running server")
    r.add_argument(
        "--url",
        default="http://localhost:8000",
        help="server address; several, comma-separated, to spread players over them",
    )
    r.add_argument("--think", default="0.2,0.8", help="seconds before each move: MIN,MAX")
    r.add_argument("--players", type=int, default=100)
    r.add_argument("--minutes", type=float, default=1.0)
    args = parser.parse_args(argv)
    if args.command == "seed":
        asyncio.run(seed(args.players))
    else:
        low, high = (float(x) for x in args.think.split(","))
        urls = [u.strip().rstrip("/") for u in args.url.split(",")]
        asyncio.run(run(urls, args.players, args.minutes, (low, high)))


if __name__ == "__main__":
    main(sys.argv[1:])
