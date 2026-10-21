/** Words for a game's state, from one player's point of view. */
import type { EndReason, Game, Player } from '@/api/endpoints';
import { mark, t } from '@/i18n';

import type { Piece } from './bfen';

/** Each side's name (marked: `t()` it where it is shown). */
export const SIDE_PLURAL: Record<Piece, string> = { goat: mark('Goats'), tiger: mark('Tigers') };

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

const COMPUTER_NAMES = {
  easy: mark('Computer (easy)'),
  medium: mark('Computer (medium)'),
  hard: mark('Computer (hard)'),
} as const;

/** Whether this side is played by the computer. */
export function isComputer(game: Game, side: Piece): boolean {
  return game.computer !== null && playerOf(game, side).username.startsWith('computer-');
}

/** A player's name as shown: their username, or "Computer (hard)". */
export function nameOf(game: Game, side: Piece): string {
  return isComputer(game, side) && game.computer !== null
    ? t(COMPUTER_NAMES[game.computer])
    : playerOf(game, side).username;
}

type Won = Exclude<EndReason, 'aborted' | 'draw_agreed'>;

/** How a game ended, as a whole sentence for each way of seeing it. */
const I_WON: Record<Won, string> = {
  five_captured: mark('You won: the tigers captured five goats.'),
  tigers_trapped: mark('You won: the tigers could not move.'),
  goats_blocked: mark('You won: the goats could not move.'),
  timeout: mark('You won on time.'),
  resigned: mark('You won by resignation.'),
  abandoned: mark('You won: the other player left.'),
};

const I_LOST: Record<Won, string> = {
  five_captured: mark('You lost: the tigers captured five goats.'),
  tigers_trapped: mark('You lost: the tigers could not move.'),
  goats_blocked: mark('You lost: the goats could not move.'),
  timeout: mark('You lost on time.'),
  resigned: mark('You lost by resignation.'),
  abandoned: mark('You lost: you were away too long.'),
};

const SIDE_WON: Record<Piece, Record<Won, string>> = {
  goat: {
    five_captured: mark('Goats ({name}) won: the tigers captured five goats.'),
    tigers_trapped: mark('Goats ({name}) won: the tigers could not move.'),
    goats_blocked: mark('Goats ({name}) won: the goats could not move.'),
    timeout: mark('Goats ({name}) won on time.'),
    resigned: mark('Goats ({name}) won by resignation.'),
    abandoned: mark('Goats ({name}) won: the other player left.'),
  },
  tiger: {
    five_captured: mark('Tigers ({name}) won: the tigers captured five goats.'),
    tigers_trapped: mark('Tigers ({name}) won: the tigers could not move.'),
    goats_blocked: mark('Tigers ({name}) won: the goats could not move.'),
    timeout: mark('Tigers ({name}) won on time.'),
    resigned: mark('Tigers ({name}) won by resignation.'),
    abandoned: mark('Tigers ({name}) won: the other player left.'),
  },
};

/** "You won: the tigers captured five goats." / "You lost on time." / "Game aborted: no result." */
export function resultText(game: Game, me: Piece | null): string | null {
  if (game.result === null) return null;
  const { winner, reason } = game.result;
  if (reason === 'draw_agreed') return t('Drawn by agreement.');
  if (winner === null || reason === 'aborted') return t('Game aborted: no result.');
  if (me === null) return t(SIDE_WON[winner][reason], { name: nameOf(game, winner) });
  return t(winner === me ? I_WON[reason] : I_LOST[reason]);
}

/** "Your move" / "bob to move" while the game is on. */
export function turnText(game: Game, me: Piece | null): string | null {
  if (game.status !== 'active') return null;
  if (game.side_to_move === me) return t('Your move');
  return t('{name} to move', { name: nameOf(game, game.side_to_move) });
}

/** "+12" / "−8" / "±0", or null when the game moved no rating. */
export function ratingChangeText(change: number | null): string | null {
  if (change === null) return null;
  if (change > 0) return `+${change}`;
  if (change < 0) return `−${-change}`;
  return '±0';
}

/** Points as players write them: 1, ½, 1½. */
export function pointsText(points: number): string {
  const whole = Math.floor(points);
  const half = points - whole >= 0.5 ? '½' : '';
  return whole === 0 && half !== '' ? half : `${whole}${half}`;
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
    title: t('Rated match · game {game} of 2', { game: match.game }),
    score:
      a && b
        ? `${a.player.username} ${pointsText(a.points)} – ${pointsText(b.points)} ${b.player.username}`
        : '',
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

const MY_MOVE = {
  placed: mark('You placed a goat on {point}.'),
  captured: mark('You captured a goat, {from} to {to}.'),
  moved: mark('You moved {from} to {to}.'),
};

const THEIR_MOVE = {
  placed: mark('{name} placed a goat on {point}.'),
  captured: mark('{name} captured a goat, {from} to {to}.'),
  moved: mark('{name} moved {from} to {to}.'),
};

/**
 * The last move in words, for screen readers: "bob moved a1 to b2.", "You placed a goat on c3.",
 * "bob captured a goat, a1 to c3." Goats move first, so even-numbered moves are the goats'.
 */
export function lastMoveText(game: Game, me: Piece | null): string | null {
  const move = game.moves.at(-1);
  if (move === undefined) return null;
  const side: Piece = (game.moves.length - 1) % 2 === 0 ? 'goat' : 'tiger';
  const [from, to] = move.split(/[-x]/);
  const kind = to === undefined ? 'placed' : move.includes('x') ? 'captured' : 'moved';
  const texts = side === me ? MY_MOVE : THEIR_MOVE;
  return t(texts[kind], {
    name: nameOf(game, side),
    point: move,
    from: String(from),
    to: String(to),
  });
}
