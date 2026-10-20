import { parseBfen } from './bfen';
import { candidateMoves, premoveDecision } from './premove';

const position = (bfen: string) => {
  const parsed = parseBfen(bfen);
  if (parsed === null) throw new Error(bfen);
  return parsed;
};

test('goats with some in hand can only place, on any empty point', () => {
  const moves = candidateMoves(position('T3T/5/5/5/T3T t 20 0'), 'goat');
  expect(moves).toHaveLength(21);
  expect(moves).toContain('c3');
  expect(moves).not.toContain('a1');
});

test('goats with none in hand step along the lines', () => {
  // Goats on b3 (no diagonals there) and c3 (diagonals too).
  const moves = candidateMoves(position('T3T/5/1GG2/5/T3T t 0 0'), 'goat');
  expect(moves).toEqual(expect.arrayContaining(['b3-b4', 'b3-b2', 'b3-a3', 'c3-d4', 'c3-b2']));
  expect(moves).not.toContain('b3-c3'); // occupied
  expect(moves).not.toContain('b3-a2'); // no diagonal from b3
});

test('tigers step, and jump a goat to an empty point beyond it', () => {
  const moves = candidateMoves(position('T3T/5/5/1G3/T3T g 19 0'), 'tiger');
  expect(moves).toContain('a1-a2');
  expect(moves).toContain('a1xc3'); // over the goat on b2
  expect(moves).not.toContain('a1-b2');
  expect(moves).not.toContain('e1xc3'); // nothing to jump on d2
});

test('a tiger cannot jump off the board or onto a piece', () => {
  // Goats on a2 (beyond it, off the board to the left) and b2 with c3 taken.
  const moves = candidateMoves(position('T3T/5/2G2/GG3/T3T g 17 0'), 'tiger');
  expect(moves).not.toContain('a1xc3');
  expect(moves).toContain('a1xa3'); // over a2, up the edge
});

test('a premove is played when it is still legal on my turn, dropped if not', () => {
  expect(premoveDecision(null, true, ['a2'])).toBe('wait');
  expect(premoveDecision('a2', false, [])).toBe('wait');
  expect(premoveDecision('a2', true, ['a2', 'b2'])).toBe('play');
  expect(premoveDecision('a2', true, ['b2'])).toBe('drop');
});
