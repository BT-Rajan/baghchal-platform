import type { Game } from '@/api/types';

/**
 * Whether `next` is a later state of the game than `current`. Snapshots can arrive out of
 * order (an HTTP response and a WebSocket event for the same move race each other).
 * A higher ply is later; at the same ply a finished game is later (resigning, aborting or a
 * timeout end the game without a move), then the later server time.
 */
export function isNewer(current: Game | undefined, next: Game): boolean {
  if (!current) return true;
  if (next.ply !== current.ply) return next.ply > current.ply;
  const done = (g: Game) => (g.status === 'finished' ? 1 : 0);
  if (done(next) !== done(current)) return done(next) > done(current);
  return Date.parse(next.server_time) >= Date.parse(current.server_time);
}

export function latest(current: Game | undefined, next: Game): Game {
  return isNewer(current, next) ? next : (current as Game);
}
