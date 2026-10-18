/** What to celebrate when a game ends while it is being watched. */
import type { EndReason, Game } from '@/api/endpoints';

import type { Piece } from './bfen';
import { SIDE_PLURAL } from './describe';

export interface Ending {
  winner: Piece;
  /** "You won!" / "You lost" / "Tigers win!" */
  headline: string;
  /** How: "Five goats captured". */
  detail: string;
  /** True when I won, false when I lost, null when I am only watching. */
  won: boolean | null;
}

const HOW: Record<Exclude<EndReason, 'aborted'>, string> = {
  five_captured: 'Five goats captured',
  tigers_trapped: 'The tigers are trapped',
  goats_blocked: 'The goats cannot move',
  timeout: 'On time',
  resigned: 'By resignation',
  abandoned: 'The other player left',
};

/**
 * The ending to show when a game I was watching (`before` is the status I last saw) has just
 * finished with a winner. Nothing for an aborted game, or one that was already over when opened.
 */
export function endingFor(before: string | null, game: Game, me: Piece | null): Ending | null {
  if (before !== 'active' || game.status !== 'finished' || game.result === null) return null;
  const { winner, reason } = game.result;
  if (winner === null || reason === 'aborted') return null;
  const won = me === null ? null : winner === me;
  return {
    winner,
    headline: won === null ? `${SIDE_PLURAL[winner]} win!` : won ? 'You won!' : 'You lost',
    detail: reason === 'abandoned' && won === false ? 'You were away too long' : HOW[reason],
    won,
  };
}
