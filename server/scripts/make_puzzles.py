"""Make the trainer's puzzles: positions from the computer's games with one clearly best move.

The computer plays itself (Easy and Medium, so mistakes happen) and each position is checked
with the engine's review: a puzzle is one where a single move beats every other by at least a
mistake's worth. Opening puzzles come while goats are still being placed; endgame puzzles once
all are on the board. The result is fixed by the seed, so running this again gives the same
file. From the repository root:

    uv run python server/scripts/make_puzzles.py > server/src/baghchal_server/trainer/puzzles.json
"""

import json
import random
import sys

from baghchal_engine import Game, Side, format_move, format_position
from baghchal_engine.ai import Level, choose_move
from baghchal_engine.review import unique_best

SEED = 2026
PER_KIND = 60
TIGER_SHARE = 0.4
"""Taking a hanging goat is the easy kind of puzzle; most should be for the goats."""


def main() -> None:
    rng = random.Random(SEED)  # noqa: S311 - puzzle variety, not security
    found: dict[str, dict[str, str]] = {}
    count = {(k, s): 0 for k in ("opening", "endgame") for s in (Side.GOAT, Side.TIGER)}
    wanted = {
        (k, s): round(PER_KIND * (TIGER_SHARE if s == Side.TIGER else 1 - TIGER_SHARE))
        for k, s in count
    }
    games = 0
    while any(count[key] < wanted[key] for key in count) and games < 400:
        games += 1
        game = Game()
        levels = (rng.choice([Level.EASY, Level.MEDIUM]), rng.choice([Level.EASY, Level.MEDIUM]))
        while not game.is_over and game.ply < 120:
            pos = game.position
            kind = "opening" if pos.in_hand > 0 else "endgame"
            key = (kind, pos.side)
            text = format_position(pos)
            if game.ply >= 4 and count[key] < wanted[key] and text not in found:
                best = unique_best(game, depth=3, seconds=0.4)
                if best is not None:
                    found[text] = {
                        "id": f"{kind[0]}{len(found) + 1:03d}",
                        "kind": kind,
                        "position": text,
                        "best": format_move(best),
                    }
                    count[key] += 1
            side = 0 if pos.side == Side.GOAT else 1
            game.play(choose_move(game, levels[side], rng=rng))
        print(f"game {games}: {dict(count)}", file=sys.stderr)
    puzzles = sorted(found.values(), key=lambda p: p["id"])
    json.dump(puzzles, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
