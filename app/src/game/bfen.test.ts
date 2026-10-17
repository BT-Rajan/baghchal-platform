import { parseBfen } from './bfen';

test('the initial position', () => {
  const position = parseBfen('T3T/5/5/5/T3T g 20 0');
  expect(position).not.toBeNull();
  expect([...(position?.pieces ?? [])]).toEqual([
    ['a5', 'tiger'],
    ['e5', 'tiger'],
    ['a1', 'tiger'],
    ['e1', 'tiger'],
  ]);
  expect(position).toMatchObject({ sideToMove: 'goat', inHand: 20, captured: 0 });
});

test('a position in play', () => {
  const position = parseBfen('TG2T/1G3/2T2/5/G3T t 17 1');
  expect(position?.pieces.get('b5')).toBe('goat');
  expect(position?.pieces.get('b4')).toBe('goat');
  expect(position?.pieces.get('c3')).toBe('tiger');
  expect(position?.pieces.get('a1')).toBe('goat');
  expect(position?.pieces.size).toBe(7);
  expect(position).toMatchObject({ sideToMove: 'tiger', inHand: 17, captured: 1 });
});

test.each([
  'T3T/5/5/5/T3T g 20',
  'T3T/5/5/5 g 20 0',
  'T3T/5/5/5/T3X g 20 0',
  'T3T/5/5/5/T4T g 20 0',
  'T3T/5/5/5/T3 g 20 0',
  'TTTTTT/5/5/5/5 g 20 0',
  'T3T/5/5/5/T3T x 20 0',
  'T3T/5/5/5/T3T g -1 0',
  'T3T/5/5/5/T3T g 20 100',
  '',
])('rejects %p', (text) => {
  expect(parseBfen(text)).toBeNull();
});
