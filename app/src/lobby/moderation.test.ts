import {
  REPORT_REASONS,
  actionText,
  dateTimeText,
  figuresText,
  reasonLabel,
  reportTitle,
  reporterText,
  standingText,
  thinkText,
} from './moderation';

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

describe('who filed a report', () => {
  const target = { id: 't', username: 'bob', suspended_until: null };
  it('names a player', () => {
    const report = { reporter: { id: 'r', username: 'alice' }, target };
    expect(reporterText(report)).toBe('alice');
    expect(reportTitle(report)).toBe('alice reported bob');
  });

  it('marks automatic fair-play reports', () => {
    const report = { reporter: null, target };
    expect(reporterText(report)).toBe('the automatic fair-play check');
    expect(reportTitle(report)).toBe('Automatic fair-play check: bob');
  });
});

describe('fair-play figures', () => {
  const base = {
    moves: 40,
    decisive: 0,
    agreement: 0,
    average_loss: 0,
    mistake_rate: 0,
    blunders: 0,
  };

  it('reads as a moderator needs', () => {
    expect(
      figuresText({
        ...base,
        decisive: 120,
        agreement: 0.92,
        average_loss: 12.4,
        mistake_rate: 0.005,
      }),
    ).toBe("Engine's move in 92.0% of 120 decisive positions · average loss 12 · mistakes 0.5%");
    expect(figuresText(base)).toBe('No decisive positions in 40 moves');
    expect(thinkText(2_400, 3)).toBe('Median 2.4 s per move · 3 under a second');
  });
});
