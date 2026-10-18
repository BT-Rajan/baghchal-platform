import { soundFor } from './sounds';

test('one new move sounds; a capture sounds different', () => {
  expect(soundFor(0, 1, ['c3'])).toBe('move');
  expect(soundFor(1, 2, ['c3', 'a1-b1'])).toBe('move');
  expect(soundFor(2, 3, ['c3', 'a1-b1', 'a5xc5'])).toBe('capture');
});

test('nothing new, or not just one new move, is silent', () => {
  expect(soundFor(null, 4, ['a2', 'a1-b1', 'b2', 'e1-d1'])).toBeNull(); // first load
  expect(soundFor(2, 2, ['c3', 'a1-b1'])).toBeNull();
  expect(soundFor(1, 3, ['c3', 'a1-b1', 'b2'])).toBeNull(); // caught up after a reconnect
  expect(soundFor(0, 1, [])).toBeNull(); // moves not sent
});
