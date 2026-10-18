import { ME } from '../../tests/support/fakeServer';
import { BOB, game } from '../../tests/support/games';

import {
  isComputer,
  nameOf,
  lastMoveText,
  matchSummary,
  movePairs,
  other,
  playerOf,
  ratingChangeText,
  resultText,
  sideOf,
  turnText,
} from './describe';

const finished = (winner: 'goat' | 'tiger' | null, reason: string) =>
  game({ status: 'finished', result: { winner, reason } as never });

test('sides and players', () => {
  const g = game();
  expect(sideOf(g, ME.id)).toBe('goat');
  expect(sideOf(g, BOB.id)).toBe('tiger');
  expect(sideOf(g, 'someone else')).toBeNull();
  expect(other('goat')).toBe('tiger');
  expect(other('tiger')).toBe('goat');
  expect(playerOf(g, 'tiger')).toEqual(BOB);
});

test('turnText', () => {
  expect(turnText(game(), 'goat')).toBe('Your move');
  expect(turnText(game(), 'tiger')).toBe('alice to move');
  expect(turnText(game({ side_to_move: 'tiger' }), null)).toBe('bob to move');
  expect(turnText(finished('goat', 'resigned'), 'goat')).toBeNull();
});

test.each([
  ['tiger', 'five_captured', 'tiger', 'You won: the tigers captured five goats.'],
  ['goat', 'tigers_trapped', 'tiger', 'You lost: the tigers could not move.'],
  ['tiger', 'goats_blocked', 'goat', 'You lost: the goats could not move.'],
  ['goat', 'timeout', 'goat', 'You won on time.'],
  ['tiger', 'resigned', 'goat', 'You lost by resignation.'],
  ['goat', 'abandoned', 'goat', 'You won: the other player left.'],
  ['goat', 'abandoned', 'tiger', 'You lost: you were away too long.'],
  ['tiger', 'timeout', null, 'Tigers (bob) won on time.'],
  [null, 'aborted', 'goat', 'Game aborted: no result.'],
] as const)('resultText: %s by %s, seen by %s', (winner, reason, me, text) => {
  expect(resultText(finished(winner, reason), me)).toBe(text);
});

test('resultText is null while playing', () => {
  expect(resultText(game(), 'goat')).toBeNull();
});

test('ratingChangeText', () => {
  expect(ratingChangeText(12)).toBe('+12');
  expect(ratingChangeText(-8)).toBe('−8');
  expect(ratingChangeText(0)).toBe('±0');
  expect(ratingChangeText(null)).toBeNull();
});

test('matchSummary', () => {
  expect(matchSummary(game())).toBeNull();
  const score = [
    { player: { id: ME.id, username: 'alice' }, points: 1 },
    { player: BOB, points: 0 },
  ];
  const first = game({ id: 'g1', match: { id: 'm1', game: 1, games: ['g1'], score } });
  expect(matchSummary(first)).toEqual({
    title: 'Rated match · game 1 of 2',
    score: 'alice 1 – 0 bob',
    otherGameId: null,
  });
  const second = game({ id: 'g2', match: { id: 'm1', game: 2, games: ['g1', 'g2'], score } });
  expect(matchSummary(second)?.otherGameId).toBe('g1');
  const odd = game({ match: { id: 'm1', game: 1, games: ['g1'], score: [] } });
  expect(matchSummary(odd)?.score).toBe('');
});

test('movePairs', () => {
  expect(movePairs([])).toEqual([]);
  expect(movePairs(['c3', 'a1-b2', 'd4'])).toEqual([
    ['1.', 'c3', 'a1-b2'],
    ['2.', 'd4', undefined],
  ]);
});

test('lastMoveText', () => {
  expect(lastMoveText(game(), 'goat')).toBeNull();
  expect(lastMoveText(game({ moves: ['c3'] }), 'goat')).toBe('You placed a goat on c3.');
  expect(lastMoveText(game({ moves: ['c3', 'a1-b1'] }), 'goat')).toBe('bob moved a1 to b1.');
  expect(lastMoveText(game({ moves: ['c3', 'a1xc3'] }), null)).toBe(
    'bob captured a goat, a1 to c3.',
  );
  expect(lastMoveText(game({ moves: ['c3', 'a1-b1', 'c3-c4'] }), 'tiger')).toBe(
    'alice moved c3 to c4.',
  );
});

test('the computer is named by its level', () => {
  const computer = { id: 'c1', username: 'computer-hard' };
  const vsComputer = game({ tiger: computer, computer: 'hard', side_to_move: 'tiger' });
  expect(isComputer(vsComputer, 'tiger')).toBe(true);
  expect(isComputer(vsComputer, 'goat')).toBe(false);
  expect(nameOf(vsComputer, 'tiger')).toBe('Computer (hard)');
  expect(nameOf(vsComputer, 'goat')).toBe('alice');
  expect(turnText(vsComputer, 'goat')).toBe('Computer (hard) to move');
  const won = game({
    tiger: computer,
    computer: 'hard',
    status: 'finished',
    result: { winner: 'tiger', reason: 'five_captured' },
  });
  expect(resultText(won, null)).toBe(
    'Tigers (Computer (hard)) won: the tigers captured five goats.',
  );
  // An ordinary game: nobody is the computer, whatever their name.
  const named = game({ tiger: { id: 'x', username: 'computer-fan' } });
  expect(isComputer(named, 'tiger')).toBe(false);
  expect(nameOf(named, 'tiger')).toBe('computer-fan');
});
