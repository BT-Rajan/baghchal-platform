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

## Live play (platform rules)
These rules belong to the platform, not the board; the server enforces them.

- **Time controls**: 3+2, 5+3, 10+5 and 15+10 (minutes per side + seconds added after each
  move). The server keeps both clocks; only server time counts.
- **First moves**: clocks start after each side's first move. Each side has 30 seconds to make
  its first move; if either does not, the game is **aborted** (no result). In the second game
  of a rated match a side that does not make its first move instead **loses on time**.
- **Time out**: a side whose clock reaches zero on its turn loses.
- **Lag allowance**: the server measures each player's round trip on the live connection and
  does not charge a move for up to 0.5 s of it, so a slow network does not cost clock time.
  The allowance starts after both first moves and never exceeds the player's measured lag.
- **Resign**: either player, at any time; the opponent wins.
- **Abort**: either player, before both sides have moved; no result. The second game of a
  rated match cannot be aborted, so nobody can skip the side they would rather not play.
- **Abandonment**: if it has been a player's turn for 60 seconds and they have been offline
  for all of the last 60 seconds, the opponent may claim the win. A connection that drops and
  comes straight back does not count as leaving.
- **Abort penalty**: a player who aborts 3 games within 24 hours (failing to make a first move
  counts too) cannot send or accept challenges for 1 hour after the third.
- **One live game per player** at a time.
- **Blocking**: a player can block another. Neither can then challenge the other (pending
  challenges between them are closed), and they no longer see each other in search or the
  online list. Only the blocker can see or undo the block.
- No draws by agreement, matching the board rules.

## Reports and moderation
- **Reports**: any player can report another for cheating, abuse, an offensive username or
  something else, optionally pointing at a game between the two. The reported player is not
  told who reported them. One open report per pair; 20 reports a day per player.
- **Suspensions**: a moderator can suspend a player for some days or ban them, always with a
  reason, which the player is emailed and shown when they try to sign in. A suspended player is
  signed out everywhere, their open challenges close, a live game counts as a resignation
  (both games of a rated match), and they are hidden from search, profiles, the online list
  and leaderboards until the suspension ends or is lifted. Their ratings are kept.
- **Renames**: a moderator can replace an offensive username; the player is emailed the new
  name and the reason.

## Ratings
- **Glicko-2**, separately for **quick** games (3+2, 5+3) and **standard** games (10+5, 15+10);
  the API calls them `blitz` and `rapid`. Everyone starts at 1500 with deviation 350. Only
  rated games count; casual games never do.
- **Rated games are two-game matches with sides swapped**: game 2 starts automatically when
  game 1 ends, so nobody's rating depends on which side they drew. Each game is rated on its
  own. If game 1 is aborted the match ends; an aborted game is never rated.
- **One rated match per pair per 24 hours**, counted from when the match started, so ratings
  cannot be farmed between friends or between one person's accounts. A match whose first game
  was aborted does not count. Casual games are not limited.
- Ratings change after every rated game with a result; the deviation (uncertainty) grows
  while a player is away (one Glicko-2 period per day) and shrinks as they play.
- A rating is **provisional** while its deviation is above 110.
- **Leaderboards** list players who are not provisional and played a rated game in that
  time control within the last 30 days.

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
