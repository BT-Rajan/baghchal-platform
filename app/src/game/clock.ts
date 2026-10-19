/** Clock maths. The server decides time-outs; this only shows its clocks counting down. */
import type { Game } from '@/api/endpoints';

import type { Piece } from './bfen';

/**
 * A side's time left at `serverNowMs`: the clock as of the game's `server_time`, less the time
 * since then if that side's clock is the running one. With the sand clock, what the running
 * side spends is added to the other side's.
 */
export function remainingMs(game: Game, side: Piece, serverNowMs: number): number {
  const { goat_ms, tiger_ms, running } = game.clocks;
  const base = side === 'goat' ? goat_ms : tiger_ms;
  if (game.status !== 'active' || running === null) return base;
  const elapsed = Math.max(0, serverNowMs - Date.parse(game.server_time));
  if (running === side) return Math.max(0, base - elapsed);
  if (game.time_control !== 'sand') return base;
  return base + Math.min(elapsed, running === 'goat' ? goat_ms : tiger_ms);
}

/** "4:05", and tenths under ten seconds: "0:09.4". */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const tenths = Math.floor(clamped / 100);
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const seconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Seconds left to make a first move (before the clocks start, each side has a short grace
 * period; missing it aborts the game). Null once the clocks are running.
 */
export function firstMoveSecondsLeft(game: Game, serverNowMs: number): number | null {
  if (game.status !== 'active' || game.ply >= 2 || game.deadline_at === null) return null;
  return Math.max(0, Math.ceil((Date.parse(game.deadline_at) - serverNowMs) / 1000));
}
