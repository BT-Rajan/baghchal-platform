import { birthMonth, classify, surely } from './age';

const NOW = new Date(Date.UTC(2026, 0, 1, 12));

test('a birth month counts as the youngest age it could mean', () => {
  expect(surely(2010, 5, 18).toISOString()).toBe('2028-06-01T00:00:00.000Z');
  expect(surely(2010, 12, 18).toISOString()).toBe('2029-01-01T00:00:00.000Z');
});

test.each([
  ['', '2010', 'incomplete'],
  ['5', '201', 'incomplete'],
  ['13', '2010', 'invalid'],
  ['0', '2010', 'invalid'],
  ['5.5', '2010', 'invalid'],
  ['5', 'abcd', 'invalid'],
  ['2', '2026', 'invalid'],
  ['1', '1890', 'invalid'],
  ['1', '2013', 'tooYoung'],
  ['12', '2012', 'minor'],
  ['6', '2010', 'minor'],
  ['12', '2007', 'adult'],
  ['1', '1990', 'adult'],
])('month %p year %p is %p', (month, year, kind) => {
  expect(classify(month, year, NOW).kind).toBe(kind);
});

test('the server takes YYYY-MM', () => {
  expect(birthMonth(' 6', '2010 ')).toBe('2010-06');
  expect(birthMonth('11', '1990')).toBe('1990-11');
});
