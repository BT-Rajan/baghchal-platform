import type { Game, Side } from '@/api/types';

import { parseBfen } from './bfen';

const REASONS: Record<string, (winner: string, loser: string) => string> = {
  five_captured: (w) => `${w} captured five goats.`,
  tigers_trapped: (w) => `${w} trapped every tiger.`,
  goats_blocked: (w, l) => `${l} had no move left.`,
  timeout: (_, l) => `${l} ran out of time.`,
  resigned: (_, l) => `${l} resigned.`,
  abandoned: (_, l) => `${l} left the game.`,
};

/** The side `userId` plays in `game`, or null for a spectator. */
export function sideOf(game: Game, userId: string): Side | null {
  if (game.goat.id === userId) return 'goat';
  if (game.tiger.id === userId) return 'tiger';
  return null;
}

export function opposite(side: Side): Side {
  return side === 'goat' ? 'tiger' : 'goat';
}

/** One line on the game's state, from `me`'s point of view. */
export function statusLine(game: Game, me: Side | null): string {
  if (game.result) {
    if (!game.result.winner) return 'Game aborted: no result.';
    const winner = game[game.result.winner].username;
    const loser = game[opposite(game.result.winner)].username;
    const why = (REASONS[game.result.reason] ?? (() => ''))(winner, loser);
    const headline =
      me === null ? `${winner} won.` : game.result.winner === me ? 'You won!' : `${winner} won.`;
    return why ? `${headline} ${why}` : headline;
  }
  const position = parseBfen(game.position);
  const toMove = game.side_to_move;
  if (me !== toMove) return `Waiting for ${game[toMove].username}…`;
  if (toMove === 'goat' && position.goatsInHand > 0) {
    return `Your move: place a goat (${position.goatsInHand} in hand).`;
  }
  return toMove === 'goat' ? 'Your move: move a goat.' : 'Your move: move or capture with a tiger.';
}
