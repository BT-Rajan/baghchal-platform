import { game } from '../../tests/support/games';

import { endingFor } from './ending';

const over = (winner: 'goat' | 'tiger' | null, reason: string) =>
  game({ status: 'finished', result: { winner, reason } as never });

test('a game that ends while I watch is celebrated', () => {
  expect(endingFor('active', over('tiger', 'five_captured'), 'tiger')).toEqual({
    winner: 'tiger',
    headline: 'You won!',
    detail: 'Five goats captured',
    won: true,
  });
  expect(endingFor('active', over('goat', 'tigers_trapped'), 'tiger')).toMatchObject({
    headline: 'You lost',
    detail: 'The tigers are trapped',
    won: false,
  });
  expect(endingFor('active', over('goat', 'resigned'), null)).toMatchObject({
    headline: 'Goats win!',
    detail: 'By resignation',
    won: null,
  });
});

test('leaving says so to the one who left', () => {
  expect(endingFor('active', over('goat', 'abandoned'), 'tiger')?.detail).toBe(
    'You were away too long',
  );
  expect(endingFor('active', over('goat', 'abandoned'), 'goat')?.detail).toBe(
    'The other player left',
  );
});

test('nothing for a game already over, still on, or without a winner', () => {
  expect(endingFor(null, over('tiger', 'timeout'), 'tiger')).toBeNull();
  expect(endingFor('finished', over('tiger', 'timeout'), 'tiger')).toBeNull();
  expect(endingFor('active', game({ status: 'active' }), 'tiger')).toBeNull();
  expect(endingFor('active', game({ status: 'finished', result: null }), 'tiger')).toBeNull();
  expect(endingFor('active', over(null, 'aborted'), 'tiger')).toBeNull();
  expect(endingFor('active', over('goat', 'aborted'), 'tiger')).toBeNull();
});
