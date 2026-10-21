/** What to celebrate when a game ends while it is being watched. */
import type { EndReason, Game } from '@/api/endpoints';
import { mark, t } from '@/i18n';

import type { Piece } from './bfen';
export interface Ending {
  winner: Piece;
  /** "You won!" / "You lost" / "Tigers win!" */
  headline: string;
  /** How: "Five goats captured". */
  detail: string;
  /** True when I won, false when I lost, null when I am only watching. */
  won: boolean | null;
}

const HOW: Record<Exclude<EndReason, 'aborted' | 'draw_agreed'>, string> = {
  five_captured: mark('Five goats captured'),
  tigers_trapped: mark('The tigers are trapped'),
  goats_blocked: mark('The goats cannot move'),
  timeout: mark('On time'),
  resigned: mark('By resignation'),
  abandoned: mark('The other player left'),
};

const SIDE_WINS: Record<Piece, string> = { goat: mark('Goats win!'), tiger: mark('Tigers win!') };

/**
 * The ending to show when a game I was watching (`before` is the status I last saw) has just
 * finished with a winner. Nothing for an aborted or drawn game (the result says so), or one that
 * was already over when opened.
 */
export function endingFor(before: string | null, game: Game, me: Piece | null): Ending | null {
  if (before !== 'active' || game.status !== 'finished' || game.result === null) return null;
  const { winner, reason } = game.result;
  if (winner === null || reason === 'aborted' || reason === 'draw_agreed') return null;
  const won = me === null ? null : winner === me;
  return {
    winner,
    headline: won === null ? t(SIDE_WINS[winner]) : won ? t('You won!') : t('You lost'),
    detail: reason === 'abandoned' && won === false ? t('You were away too long') : t(HOW[reason]),
    won,
  };
}
