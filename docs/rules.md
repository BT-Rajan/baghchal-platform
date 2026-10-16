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

## No repeated positions
Once all 20 goats have been placed, **no move may return the board to an arrangement that has
already occurred in the game**. Such a move is illegal for either side. Arrangements are
compared as boards (where every tiger and goat stands), regardless of whose turn it was.
During placement the rule cannot apply, because the number of goats in hand changes every
goat turn.

## End of the game
| Condition | Result |
|---|---|
| Tigers have captured 5 goats | Tigers win |
| Tigers are to move and have no legal move | Goats win |
| Goats are to move and have no legal move | Tigers win |

"No legal move" includes moves forbidden by the repetition rule. There is no drawn result on
the board: the number of arrangements is finite and none may repeat, so every game ends with
a winner. Resignation and timeouts are decided by the server, not the engine.

## Sources
These are the traditional rules as described by
[Wikipedia](https://en.wikipedia.org/wiki/Bagh-chal) and Nepali sources such as
[The Annapurna Express](https://theannapurnaexpress.com/story/60219/). Goats moving first,
the five-capture and trapped-tiger wins, and the repetition ban after placement are
consistent across sources. Traditional descriptions rarely address goats being unable to
move; the sources that do award the game to the tigers
([baghchal.net](https://www.baghchal.net/rules)), matching the general principle that the
side unable to move loses. Threefold-repetition draws found in some online versions are a
modern variant and are not used here.

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
