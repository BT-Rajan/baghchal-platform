/**
 * Turning taps into moves. Which pieces can move, and where, comes only from the server's
 * `legal_moves` (placement `c3`, step `a1-b2`, capture `a1xc3`); the app has no rules engine.
 *
 * - While goats are being placed, tapping a highlighted empty point places a goat there.
 * - Otherwise, tap one of your pieces, then a highlighted destination. Tapping another of your
 *   movable pieces changes the selection; tapping anywhere else clears it.
 */

export interface Highlights {
  /** Points whose piece can be picked up (none while placing). */
  movable: ReadonlySet<string>;
  /** Point → the move that ends there, for the current selection (or placements). */
  targets: ReadonlyMap<string, string>;
}

const SEPARATOR = /[-x]/;

function split(move: string): { from: string | null; to: string } {
  const parts = move.split(SEPARATOR);
  return parts.length === 2
    ? { from: parts[0] as string, to: parts[1] as string }
    : { from: null, to: move };
}

export function highlights(legalMoves: readonly string[], selected: string | null): Highlights {
  const movable = new Set<string>();
  const targets = new Map<string, string>();
  for (const move of legalMoves) {
    const { from, to } = split(move);
    if (from === null) targets.set(to, move);
    else {
      movable.add(from);
      if (from === selected) targets.set(to, move);
    }
  }
  return { movable, targets };
}

export interface TapResult {
  selected: string | null;
  /** A complete move to send, if this tap finished one. */
  move: string | null;
}

export function tap(
  legalMoves: readonly string[],
  selected: string | null,
  point: string,
): TapResult {
  const { movable, targets } = highlights(legalMoves, selected);
  const move = targets.get(point);
  if (move !== undefined) return { selected: null, move };
  if (movable.has(point) && point !== selected) return { selected: point, move: null };
  return { selected: null, move: null };
}

/** The points a move touched: for highlighting the last move played. */
export function movePoints(move: string | undefined): string[] {
  if (move === undefined) return [];
  const { from, to } = split(move);
  return from === null ? [to] : [from, to];
}
