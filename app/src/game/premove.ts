/**
 * Premoves: a move chosen while the opponent is thinking, played the moment it is my turn if it
 * is still legal then (the server's legal moves decide). While it is not my turn the server
 * sends no legal moves for me, so the candidates come from the board's geometry
 * (docs/rules.md): goats place while any are in hand, then step; tigers step or jump a goat.
 * The repetition rule is left to the server's check when the turn comes.
 */
import { SIZE, pointName } from './board';
import type { Piece, Position } from './bfen';

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function at(name: string): [number, number] {
  return [name.charCodeAt(0) - 97, Number(name[1]) - 1];
}

function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < SIZE && rank >= 0 && rank < SIZE;
}

/** The directions lines run from this point: diagonals only where file + rank is even. */
function directions(file: number, rank: number): readonly (readonly [number, number])[] {
  return (file + rank) % 2 === 0 ? [...STEPS, ...DIAGONALS] : STEPS;
}

/** The moves `side` could make in `position` if it were their turn (notation as the server's). */
export function candidateMoves(position: Position, side: Piece): string[] {
  const empty = (name: string) => !position.pieces.has(name);
  const moves: string[] = [];
  if (side === 'goat' && position.inHand > 0) {
    for (let rank = 0; rank < SIZE; rank++) {
      for (let file = 0; file < SIZE; file++) {
        const name = pointName(file, rank);
        if (empty(name)) moves.push(name);
      }
    }
    return moves;
  }
  for (const [from, piece] of position.pieces) {
    if (piece !== side) continue;
    const [file, rank] = at(from);
    for (const [df, dr] of directions(file, rank)) {
      const [f1, r1] = [file + df, rank + dr];
      if (!onBoard(f1, r1)) continue;
      const next = pointName(f1, r1);
      if (empty(next)) moves.push(`${from}-${next}`);
      else if (side === 'tiger' && position.pieces.get(next) === 'goat') {
        const [f2, r2] = [f1 + df, r1 + dr];
        if (onBoard(f2, r2) && empty(pointName(f2, r2))) moves.push(`${from}x${pointName(f2, r2)}`);
      }
    }
  }
  return moves;
}

/** What to do with a premove now that the game has moved on: play it, keep it, or drop it. */
export function premoveDecision(
  premove: string | null,
  myTurn: boolean,
  legalMoves: readonly string[],
): 'play' | 'wait' | 'drop' {
  if (premove === null) return 'wait';
  if (!myTurn) return 'wait';
  return legalMoves.includes(premove) ? 'play' : 'drop';
}
