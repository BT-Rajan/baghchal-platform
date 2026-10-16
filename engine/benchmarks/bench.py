"""Engine throughput. Run with: uv run python engine/benchmarks/bench.py"""

import random
import time

from baghchal_engine import Game, Position, legal_moves, perft


def _timed(label: str, count: int, unit: str, seconds: float) -> None:
    print(f"{label:<28} {count / seconds:>12,.0f} {unit}/s  ({seconds:.2f}s)")


def main() -> None:
    start = time.perf_counter()
    nodes = perft(Position.initial(), 5)
    _timed("perft(5)", nodes, "nodes", time.perf_counter() - start)

    rng = random.Random(1)
    positions: list[Position] = []
    for _ in range(200):
        game = Game()
        while not game.is_over and game.ply < 200:
            positions.append(game.position)
            game.play(rng.choice(game.legal_moves()))
    start = time.perf_counter()
    for pos in positions:
        legal_moves(pos)
    _timed("legal_moves (mixed)", len(positions), "positions", time.perf_counter() - start)

    start = time.perf_counter()
    plies = 0
    for _ in range(200):
        game = Game()
        while not game.is_over and game.ply < 200:
            game.play(rng.choice(game.legal_moves()))
        plies += game.ply
    _timed("Game.play (checked)", plies, "moves", time.perf_counter() - start)


if __name__ == "__main__":
    main()
