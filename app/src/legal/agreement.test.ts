import { asksParent, checkAgreement } from './agreement';

const NOW = new Date('2026-10-19T12:00:00Z');

test('an adult sends only the month of birth', () => {
  const input = { month: '3', year: '1990', parentEmail: 'ignored@example.com' };
  expect(checkAgreement(input, NOW, { guest: false, ownEmail: 'me@example.com' })).toEqual({
    problems: {},
    details: { birth_month: '1990-03' },
  });
});

test('a minor making an account names a parent; a minor guest does not', () => {
  const input = { month: '1', year: '2011', parentEmail: ' Ma@example.com ' };
  expect(checkAgreement(input, NOW, { guest: false, ownEmail: 'me@example.com' }).details).toEqual({
    birth_month: '2011-01',
    parent_email: 'Ma@example.com',
  });
  expect(checkAgreement(input, NOW, { guest: true, ownEmail: '' }).details).toEqual({
    birth_month: '2011-01',
  });
  expect(asksParent({ kind: 'minor' }, true)).toBe(false);
});
