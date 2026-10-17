import { REPORT_REASONS, actionText, dateTimeText, reasonLabel, standingText } from './moderation';

const NOW = Date.parse('2026-01-05T12:00:00Z');
const PLAYER = { deleted: false, banned: false, suspended_until: null };

test('report reasons', () => {
  expect(REPORT_REASONS.map((r) => r.value)).toEqual(['cheating', 'abuse', 'username', 'other']);
  expect(reasonLabel('username')).toBe('Offensive name');
});

test('dates and times are in UTC', () => {
  expect(dateTimeText('2026-01-08T12:00:00Z')).toBe('8 January 2026, 12:00 UTC');
});

test('standing', () => {
  expect(standingText(PLAYER, NOW)).toBe('In good standing');
  expect(standingText({ ...PLAYER, deleted: true }, NOW)).toBe('Deleted account');
  expect(
    standingText({ ...PLAYER, banned: true, suspended_until: '9999-12-31T00:00:00Z' }, NOW),
  ).toBe('Banned');
  expect(standingText({ ...PLAYER, suspended_until: '2026-01-08T12:00:00Z' }, NOW)).toBe(
    'Suspended until 8 January 2026, 12:00 UTC',
  );
  expect(standingText({ ...PLAYER, suspended_until: '2026-01-01T12:00:00Z' }, NOW)).toBe(
    'In good standing',
  );
});

test('the moderation log', () => {
  const at = '2026-01-08T09:30:00Z';
  expect(actionText({ action: 'suspend', reason: 'r', moderator: 'kate', created_at: at })).toBe(
    'Suspended · kate · 8 January 2026, 09:30 UTC',
  );
  expect(
    actionText({ action: 'dismiss_report', reason: 'r', moderator: null, created_at: at }),
  ).toBe('Dismissed a report · a former moderator · 8 January 2026, 09:30 UTC');
});
