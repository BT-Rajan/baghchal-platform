/** Words for a game's state, from one player's point of view. */
import type { EndReason, Game, Player } from '@/api/endpoints';

import type { Piece } from './bfen';

export const SIDE_PLURAL: Record<Piece, string> = { goat: 'Goats', tiger: 'Tigers' };

export function other(side: Piece): Piece {
  return side === 'goat' ? 'tiger' : 'goat';
}

/** My side in this game, or null when I am not playing in it. */
export function sideOf(game: Game, userId: string): Piece | null {
  if (game.goat.id === userId) return 'goat';
  if (game.tiger.id === userId) return 'tiger';
  return null;
}

export function playerOf(game: Game, side: Piece): Player {
  return side === 'goat' ? game.goat : game.tiger;
}

/** How a game ended, to follow "You won" / "You lost" / "Goats (alice) won". */
const HOW: Record<Exclude<EndReason, 'aborted'>, string> = {
  five_captured: ': the tigers captured five goats',
  tigers_trapped: ': the tigers could not move',
  goats_blocked: ': the goats could not move',
  timeout: ' on time',
  resigned: ' by resignation',
  abandoned: ': the other player left',
};

/** "You won: the tigers captured five goats." / "You lost on time." / "Game aborted: no result." */
export function resultText(game: Game, me: Piece | null): string | null {
  if (game.result === null) return null;
  const { winner, reason } = game.result;
  if (winner === null || reason === 'aborted') return 'Game aborted: no result.';
  if (me === null)
    return `${SIDE_PLURAL[winner]} (${playerOf(game, winner).username}) won${HOW[reason]}.`;
  if (reason === 'abandoned' && winner !== me) return 'You lost: you were away too long.';
  return `${winner === me ? 'You won' : 'You lost'}${HOW[reason]}.`;
}

/** "Your move" / "bob to move" while the game is on. */
export function turnText(game: Game, me: Piece | null): string | null {
  if (game.status !== 'active') return null;
  if (game.side_to_move === me) return 'Your move';
  return `${playerOf(game, game.side_to_move).username} to move`;
}

/** "+12" / "−8" / "±0", or null when the game moved no rating. */
export function ratingChangeText(change: number | null): string | null {
  if (change === null) return null;
  if (change > 0) return `+${change}`;
  if (change < 0) return `−${-change}`;
  return '±0';
}

export interface MatchSummary {
  /** "Rated match · game 1 of 2" */
  title: string;
  /** "alice 1 – 0 bob" */
  score: string;
  /** The match's other game, once it exists. */
  otherGameId: string | null;
}

export function matchSummary(game: Game): MatchSummary | null {
  const match = game.match;
  if (match === null) return null;
  const [a, b] = match.score;
  const otherGameId = match.games.find((id) => id !== game.id) ?? null;
  return {
    title: `Rated match · game ${match.game} of 2`,
    score: a && b ? `${a.player.username} ${a.points} – ${b.points} ${b.player.username}` : '',
    otherGameId,
  };
}

/** Moves in pairs, numbered: [["1.", "c3", "a1-b2"], …] (goats move first). */
export function movePairs(moves: readonly string[]): [string, string, string | undefined][] {
  const pairs: [string, string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([`${i / 2 + 1}.`, moves[i] as string, moves[i + 1]]);
  }
  return pairs;
}
