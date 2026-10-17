import { EDGES, POINTS, pointName } from './board';

test('25 points, a5 first and e1 last', () => {
  expect(POINTS).toHaveLength(25);
  expect(POINTS[0]).toEqual({ name: 'a5', file: 0, rank: 4 });
  expect(POINTS[24]).toEqual({ name: 'e1', file: 4, rank: 0 });
  expect(new Set(POINTS.map((p) => p.name)).size).toBe(25);
  expect(pointName(2, 2)).toBe('c3');
});

test('40 orthogonal and 16 diagonal edges (docs/rules.md)', () => {
  const diagonal = EDGES.filter(([p, q]) => p.file !== q.file && p.rank !== q.rank);
  expect(EDGES).toHaveLength(56);
  expect(diagonal).toHaveLength(16);
  const names = new Set(EDGES.map(([p, q]) => [p.name, q.name].sort().join('-')));
  expect(names.size).toBe(56);
  expect(names.has('a1-b2')).toBe(true); // on the long diagonal
  expect(names.has('b1-c2')).toBe(false); // b1 has an odd index sum: no diagonals
  expect(names.has('a3-b4')).toBe(true); // the inner diamond
});
