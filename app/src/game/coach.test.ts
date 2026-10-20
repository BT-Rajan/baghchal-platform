import { game } from '../../tests/support/games';

import { coachTip, isCoached, listText } from './coach';

const easy = (overrides: Parameters<typeof game>[0] = {}) =>
  game({ computer: 'easy', ...overrides });

test('lists', () => {
  expect(listText([])).toBe('');
  expect(listText(['a2'])).toBe('a2');
  expect(listText(['a2', 'b3'])).toBe('a2 and b3');
  expect(listText(['a2', 'b3', 'c4'])).toBe('a2, b3 and c4');
});

test('only my games against the Easy computer are coached', () => {
  expect(isCoached(easy(), 'goat')).toBe(true);
  expect(isCoached(easy(), null)).toBe(false);
  expect(isCoached(game({ computer: 'medium' }), 'goat')).toBe(false);
  expect(isCoached(game(), 'goat')).toBe(false);
});

test('goats: place, keep safe, then move', () => {
  expect(coachTip(easy(), 'goat')?.title).toBe('Place a goat');
  expect(coachTip(easy(), 'goat')?.text).toMatch(/^Tap any glowing point: 20 goats still/);
  expect(coachTip(easy({ position: 'T3T/5/5/5/T3T g 1 0' }), 'goat')?.text).toMatch(
    /^Tap any glowing point: 1 goat still/,
  );
  expect(coachTip(easy({ goats_in_danger: ['a2'] }), 'goat')).toEqual({
    title: 'A goat in danger',
    text: 'A tiger can jump the goat on a2. Place a goat on the empty point behind it to block the jump.',
  });
  expect(coachTip(easy({ goats_in_danger: ['a2', 'b2'] }), 'goat')?.text).toMatch(
    /Place goats on the empty points behind them/,
  );
  const moving = 'TGGGT/GGGGG/GG1GG/GGGGG/TGGGT g 0 0';
  expect(coachTip(easy({ position: moving, goats_in_danger: ['b2', 'c4'] }), 'goat')).toEqual({
    title: 'Goats in danger',
    text: 'A tiger can jump the goats on b2 and c4. Fill the empty points behind them, or move them out of reach.',
  });
  expect(coachTip(easy({ position: moving }), 'goat')?.title).toBe('Move a goat');
  const captured = easy({ position: 'T3T/5/T4/5/4T g 17 1', ply: 2, moves: ['a2', 'a1xa3'] });
  expect(coachTip(captured, 'goat')).toEqual({
    title: 'A goat was captured',
    text: 'The tigers have 1 of the 5 they need. Keep your goats side by side, so no tiger finds an empty point behind one.',
  });
});

test('tigers: move, and capture when they can', () => {
  const mine = { side_to_move: 'tiger' as const };
  expect(coachTip(easy({ ...mine, legal_moves: ['a1-b1'] }), 'tiger')?.title).toBe('Move a tiger');
  expect(coachTip(easy({ ...mine, legal_moves: ['a1-b1', 'a1xa3'] }), 'tiger')?.title).toBe(
    'You can capture',
  );
});

test('while the computer thinks', () => {
  expect(coachTip(easy(), 'tiger')?.text).toMatch(/hem your tigers in/);
  expect(coachTip(easy({ side_to_move: 'tiger' }), 'goat')?.text).toMatch(/^Watch the tigers/);
});

test('after the game: what to try next', () => {
  const over = (winner: 'goat' | 'tiger' | null, reason: string) =>
    easy({ status: 'finished', result: { winner, reason } as never, legal_moves: [] });
  expect(coachTip(over('goat', 'tigers_trapped'), 'goat')?.title).toBe('Well played!');
  expect(coachTip(over('tiger', 'five_captured'), 'goat')?.title).toBe('The tigers got five goats');
  expect(coachTip(over('goat', 'tigers_trapped'), 'tiger')?.title).toBe('Your tigers were trapped');
  expect(coachTip(over(null, 'aborted'), 'goat')?.title).toBe('Game over');
});

test('a position that cannot be read gets no tip', () => {
  expect(coachTip(easy({ position: 'nonsense' }), 'goat')).toBeNull();
});
