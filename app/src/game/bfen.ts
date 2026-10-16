/**
 * Positions in BFEN (docs/rules.md): ranks 5→1 separated by `/`, `T` tiger, `G` goat, digits for
 * runs of empty points; then the side to move (`g`/`t`), goats in hand, goats captured.
 * Example: `T3T/5/5/5/T3T g 20 0`. The server is the authority; this only reads what it sends.
 */
import { SIZE, pointName } from './board';

export type Piece = 'tiger' | 'goat';

export interface Position {
  pieces: ReadonlyMap<string, Piece>;
  sideToMove: Piece;
  inHand: number;
  captured: number;
}

/** Parses a BFEN string; null if it is not one. */
export function parseBfen(text: string): Position | null {
  const fields = text.split(' ');
  if (fields.length !== 4) return null;
  const [board, side, hand, captured] = fields as [string, string, string, string];
  const ranks = board.split('/');
  if (ranks.length !== SIZE) return null;
  const pieces = new Map<string, Piece>();
  for (const [row, text] of ranks.entries()) {
    const rank = SIZE - 1 - row;
    let file = 0;
    for (const ch of text) {
      if (ch >= '1' && ch <= '5') file += Number(ch);
      else if (ch === 'T' || ch === 'G') {
        if (file >= SIZE) return null;
        pieces.set(pointName(file, rank), ch === 'T' ? 'tiger' : 'goat');
        file += 1;
      } else return null;
    }
    if (file !== SIZE) return null;
  }
  if (side !== 'g' && side !== 't') return null;
  if (!/^\d{1,2}$/.test(hand) || !/^\d{1,2}$/.test(captured)) return null;
  return {
    pieces,
    sideToMove: side === 'g' ? 'goat' : 'tiger',
    inHand: Number(hand),
    captured: Number(captured),
  };
}
