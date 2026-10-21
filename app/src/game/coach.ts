/**
 * The coach: a tip for each moment of a game against the Easy computer, for players learning
 * the game. Everything comes from what the server sends (the position, its legal moves and the
 * goats in danger); the app still has no rules engine.
 */
import type { Game } from '@/api/endpoints';
import { plural, t } from '@/i18n';

import { parseBfen, type Piece } from './bfen';

export interface Tip {
  title: string;
  text: string;
}

/** "a2", "a2 and b3", "a2, b3 and c4". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return t('{list} and {last}', {
    list: items.slice(0, -1).join(', '),
    last: items[items.length - 1] as string,
  });
}

/** Whether a game is coached: one of mine against the Easy computer. */
export function isCoached(game: Game, me: Piece | null): me is Piece {
  return me !== null && game.computer === 'easy';
}

export function coachTip(game: Game, me: Piece): Tip | null {
  const position = parseBfen(game.position);
  if (position === null) return null;
  if (game.result !== null) return endTip(game, me);
  if (game.side_to_move !== me) {
    return {
      title: t('The computer is thinking'),
      text:
        me === 'goat'
          ? t('Watch the tigers: each one looks for a goat with an empty point right behind it.')
          : t('The goats try to hem your tigers in. Keep an eye on where they close the gaps.'),
    };
  }
  const last = game.moves[game.ply - 1];
  if (me === 'tiger') {
    return game.legal_moves.some((m) => m.includes('x'))
      ? {
          title: t('You can capture'),
          text: t('Tap a tiger next to a goat, then the empty point beyond the goat to jump it.'),
        }
      : {
          title: t('Move a tiger'),
          text: t(
            'Tap a tiger, then a glowing point. Look for goats with an empty point behind them: those are captures for your next turn.',
          ),
        };
  }
  const placing = position.inHand > 0;
  if (game.goats_in_danger.length > 0) {
    const goats = game.goats_in_danger;
    const n = goats.length;
    const values = { points: listText(goats) };
    return {
      title: plural(n, 'A goat in danger', 'Goats in danger'),
      text: placing
        ? plural(
            n,
            'A tiger can jump the goat on {points}. Place a goat on the empty point behind it to block the jump.',
            'A tiger can jump the goats on {points}. Place goats on the empty points behind them to block the jump.',
            values,
          )
        : plural(
            n,
            'A tiger can jump the goat on {points}. Fill the empty point behind it, or move it out of reach.',
            'A tiger can jump the goats on {points}. Fill the empty points behind them, or move them out of reach.',
            values,
          ),
    };
  }
  if (last?.includes('x')) {
    return {
      title: t('A goat was captured'),
      text: t(
        'The tigers have {captured} of the 5 they need. Keep your goats side by side, so no tiger finds an empty point behind one.',
        { captured: position.captured },
      ),
    };
  }
  return placing
    ? {
        title: t('Place a goat'),
        text: plural(
          position.inHand,
          'Tap any glowing point: {count} goat still to place. Start along the edges and keep them together.',
          'Tap any glowing point: {count} goats still to place. Start along the edges and keep them together.',
        ),
      }
    : {
        title: t('Move a goat'),
        text: t(
          'All your goats are on the board. Tap a goat, then a glowing point next to it. Close in until no tiger can move.',
        ),
      };
}

function endTip(game: Game, me: Piece): Tip {
  const { winner, reason } = game.result!;
  if (winner === me) {
    return {
      title: t('Well played!'),
      text: t('Ready for more? Try the Medium computer, or play someone from the lobby.'),
    };
  }
  if (reason === 'five_captured') {
    return {
      title: t('The tigers got five goats'),
      text: t(
        'A tiger can only jump a goat with an empty point behind it. Keep your goats in lines and fill the gaps, then try again.',
      ),
    };
  }
  if (reason === 'tigers_trapped') {
    return {
      title: t('Your tigers were trapped'),
      text: t('Keep your tigers apart and in the open, so each always has somewhere to go.'),
    };
  }
  return {
    title: t('Game over'),
    text: t('Play again whenever you like: the Easy computer is the place to practise.'),
  };
}
