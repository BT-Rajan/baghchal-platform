"""Calibration for the automatic fair-play checks (docs/plans/phase-7-fair-play.md).

Plays games between the computer's levels and reviews every move twice: as the screen does
(depth 3, 0.25 s per position) and as the confirmation does (depth 6, 1 s). Hard stands in for
a player using a strong engine, Medium for one using a weak engine, Easy for a person who makes
mistakes. It prints each level's figures per game and over windows of games (a player is judged
on a window, never on one game), which the thresholds in
``server/src/baghchal_server/fair_play/thresholds.py`` are set from.

    uv run python tools/fair_play_calibrate.py play --games 8 --out calibration.json
    uv run python tools/fair_play_calibrate.py report calibration.json

Bots are not people: the thresholds are deliberately far from what the bots that stand in for
people do, and are revisited once real games have been checked.
"""

import argparse
import json
import random
import statistics
import sys
import time
from collections import defaultdict
from multiprocessing import Pool
from typing import Any

from baghchal_engine import Game, format_move, parse_move
from baghchal_engine.ai import Level, choose_move
from baghchal_engine.fair_play import Figures, figures
from baghchal_engine.position import Side
from baghchal_engine.review import review

PAIRS = [
    ("hard", "hard"),
    ("medium", "hard"),
    ("hard", "medium"),
    ("medium", "medium"),
    ("easy", "medium"),
    ("medium", "easy"),
    ("easy", "hard"),
    ("hard", "easy"),
]
MAX_PLY = 160
SCREEN = {"depth": 3, "seconds": 0.25}
CONFIRM = {"depth": 6, "seconds": 1.0}
WINDOW = 8


def _play(job: tuple[str, str, int]) -> dict[str, Any]:
    goat, tiger, seed = job
    rng = random.Random(seed)  # noqa: S311 - a simulation
    game = Game()
    moves: list[str] = []
    while game.outcome is None and len(moves) < MAX_PLY:
        level = goat if game.position.side is Side.GOAT else tiger
        move = choose_move(game, Level(level), rng=rng)
        moves.append(format_move(move))
        game.play(move)
    out: dict[str, Any] = {"goat": goat, "tiger": tiger, "seed": seed, "moves": moves}
    for name, how in (("screen", SCREEN), ("confirm", CONFIRM)):
        found = figures(review((parse_move(m) for m in moves), **how))  # type: ignore[arg-type]
        out[name] = {side.name.lower(): vars(found[side]) for side in Side}
    return out


def play(args: argparse.Namespace) -> None:
    jobs = [(g, t, s) for g, t in PAIRS for s in range(args.games)]
    started = time.time()
    with Pool(args.workers) as pool:
        games = pool.map(_play, jobs)
    with open(args.out, "w") as f:
        json.dump(games, f)
    print(f"{len(games)} games in {time.time() - started:.0f} s → {args.out}")


def _summary(xs: list[float]) -> str:
    return f"{statistics.mean(xs):6.3f} [{min(xs):6.3f} - {max(xs):6.3f}]"


def report(args: argparse.Namespace) -> None:
    with open(args.file) as f:
        games = json.load(f)
    rng = random.Random(0)  # noqa: S311 - sampling windows
    for stage in ("screen", "confirm"):
        per_level: dict[str, list[Figures]] = defaultdict(list)
        for g in games:
            for side in ("goat", "tiger"):
                per_level[g[side]].append(Figures(**g[stage][side]))
        print(f"\n== {stage}: per game (both sides) and per window of {WINDOW} games")
        print(
            f"{'level':7} {'n':>4}  {'decisive':>8}  {'agreement':>24}  {'avg loss':>24}  "
            f"{'mistake rate':>24}"
        )
        for level in ("easy", "medium", "hard"):
            found = per_level[level]
            windows = [
                sum(rng.sample(found, WINDOW), Figures())
                for _ in range(200)
                if len(found) >= WINDOW
            ]
            for label, all_rows in ((level, found), (f"{level}/w", windows)):
                rows = [r for r in all_rows if r.decisive]
                if not rows:
                    continue
                print(
                    f"{label:7} {len(rows):4}  {statistics.mean(r.decisive for r in rows):8.1f}  "
                    f"{_summary([r.agreement for r in rows])}  "
                    f"{_summary([r.average_loss for r in rows])}  "
                    f"{_summary([r.mistake_rate for r in rows])}"
                )


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(required=True)
    p = sub.add_parser("play", help="play and review games")
    p.add_argument("--games", type=int, default=8, help="games per pairing")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--out", default="calibration.json")
    p.set_defaults(run=play)
    r = sub.add_parser("report", help="summarise a calibration file")
    r.add_argument("file")
    r.set_defaults(run=report)
    args = parser.parse_args(argv)
    args.run(args)


if __name__ == "__main__":
    main(sys.argv[1:])
