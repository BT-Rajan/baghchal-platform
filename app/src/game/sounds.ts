/** Which sound a newly arrived game state should make. */

export type Sound = 'move' | 'capture';

/**
 * The sound for a game that went from `before` moves to `ply` moves: one for exactly one new
 * move (a capture's notation has an "x"), and none for the first load, a jump after a
 * reconnect, or stepping through a replay.
 */
export function soundFor(
  before: number | null,
  ply: number,
  moves: readonly string[],
): Sound | null {
  if (before === null || ply !== before + 1) return null;
  const last = moves[ply - 1];
  if (last === undefined) return null;
  return last.includes('x') ? 'capture' : 'move';
}
