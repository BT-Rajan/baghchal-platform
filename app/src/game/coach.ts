/**
 * The coach: a tip for each moment of a game against the Easy computer, for players learning
 * the game. Everything comes from what the server sends (the position, its legal moves and the
 * goats in danger); the app still has no rules engine.
 */
import type { Game } from '@/api/endpoints';

import { parseBfen, type Piece } from './bfen';

export interface Tip {
  title: string;
  text: string;
}

/** "a2", "a2 and b3", "a2, b3 and c4". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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
      title: 'The computer is thinking',
      text:
        me === 'goat'
          ? 'Watch the tigers: each one looks for a goat with an empty point right behind it.'
          : 'The goats try to hem your tigers in. Keep an eye on where they close the gaps.',
    };
  }
  const last = game.moves[game.ply - 1];
  if (me === 'tiger') {
    return game.legal_moves.some((m) => m.includes('x'))
      ? {
          title: 'You can capture',
          text: 'Tap a tiger next to a goat, then the empty point beyond the goat to jump it.',
        }
      : {
          title: 'Move a tiger',
          text:
            'Tap a tiger, then a glowing point. Look for goats with an empty point behind ' +
            'them: those are captures for your next turn.',
        };
  }
  const placing = position.inHand > 0;
  if (game.goats_in_danger.length > 0) {
    const goats = game.goats_in_danger;
    const one = goats.length === 1;
    const it = one ? 'it' : 'them';
    const points = one ? 'the empty point' : 'the empty points';
    return {
      title: one ? 'A goat in danger' : 'Goats in danger',
      text:
        `A tiger can jump ${one ? 'the goat' : 'the goats'} on ${listText(goats)}. ` +
        (placing
          ? `Place ${one ? 'a goat' : 'goats'} on ${points} behind ${it} to block the jump.`
          : `Fill ${points} behind ${it}, or move ${it} out of reach.`),
    };
  }
  if (last?.includes('x')) {
    return {
      title: 'A goat was captured',
      text:
        `The tigers have ${position.captured} of the 5 they need. Keep your goats side by ` +
        'side, so no tiger finds an empty point behind one.',
    };
  }
  return placing
    ? {
        title: 'Place a goat',
        text:
          `Tap any glowing point: ${position.inHand} ${position.inHand === 1 ? 'goat' : 'goats'} still to place. Start along the ` +
          'edges and keep them together.',
      }
    : {
        title: 'Move a goat',
        text:
          'All your goats are on the board. Tap a goat, then a glowing point next to it. ' +
          'Close in until no tiger can move.',
      };
}

function endTip(game: Game, me: Piece): Tip {
  const { winner, reason } = game.result!;
  if (winner === me) {
    return {
      title: 'Well played!',
      text: 'Ready for more? Try the Medium computer, or play someone from the lobby.',
    };
  }
  if (reason === 'five_captured') {
    return {
      title: 'The tigers got five goats',
      text:
        'A tiger can only jump a goat with an empty point behind it. Keep your goats in ' +
        'lines and fill the gaps, then try again.',
    };
  }
  if (reason === 'tigers_trapped') {
    return {
      title: 'Your tigers were trapped',
      text: 'Keep your tigers apart and in the open, so each always has somewhere to go.',
    };
  }
  return {
    title: 'Game over',
    text: 'Play again whenever you like: the Easy computer is the place to practise.',
  };
}
