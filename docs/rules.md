# Rules of Bagh Chal (platform canon)

These are the rules the engine (`engine/`) enforces. Every rule here is covered by a test;
changing one is a rules change and must update this file, the tests and the pinned perft values.

## Board
- 25 points on a 5×5 grid, named `a1`–`e5`: files a–e left to right, ranks 1–5 bottom to top.
- Every point is joined to its orthogonal neighbours.
- A point is also joined diagonally when its file index + rank index is even (`a1`, `c1`,
  `b2`, `c3`, …). This draws the two long diagonals and the inner diamond:
  16 diagonal edges and 40 orthogonal edges.

## Pieces and setup
- 4 tigers start on the corners `a1`, `e1`, `a5`, `e5`.
- 20 goats start off the board, in hand.
- **Goats move first.**

## Turns
- **Goats, placement phase** (any goats still in hand): the goat player must place one goat
  on any empty point. Goats on the board cannot move until all 20 have been placed.
- **Goats, movement phase**: move one goat one step along a line to an adjacent empty point.
- **Tigers, always**: either step one tiger along a line to an adjacent empty point, or
  capture: jump over an adjacent goat, in a straight line, to the empty point directly beyond.
  The goat is removed. One capture per turn (no multi-jumps). Capturing is never compulsory.

## End of the game
| Condition | Result |
|---|---|
| Tigers have captured 5 goats | Tigers win |
| Tigers are to move and have no legal move | Goats win |
| Goats are to move in the movement phase and have no legal move | **Draw** (see decisions) |
| The same position (same pieces, same side to move, same goats in hand and captured) occurs a 3rd time | Draw |

Resignation, timeouts, abandonment and agreed draws are decided by the server, not the engine.

## Decisions that are ours to make
Traditional sources disagree on these; the defaults below are set in `engine/…/game.py`
(`Rules`) and can be changed per game mode without touching move generation.

1. **Goat stalemate** — default *draw*. Alternatives: tigers win, or goats lose.
2. **Repetition limit** — default *3* (automatic, no claim needed). Because the number of
   positions is finite, automatic repetition guarantees every game ends.

## Notation
- Moves: placement `c3`, step `a1-b2`, capture `a1xc3`.
- Positions (BFEN): ranks 5→1 separated by `/`, `T` tiger, `G` goat, digits for empty runs,
  then side to move (`g`/`t`), goats in hand, goats captured.
  Initial position: `T3T/5/5/5/T3T g 20 0`.

## Move-generation check (perft)
Leaf counts of the legal-move tree from the initial position:

| Depth | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Nodes | 21 | 252 | 5,052 | 68,204 | 1,304,788 |
