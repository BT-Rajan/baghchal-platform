import { FREE, PLANS, PLUS_UNTIL } from '../../tests/support/plans';

import {
  DURATIONS,
  GRANTABLE,
  featureText,
  grantBody,
  grantText,
  has,
  myPlanText,
  planFor,
  comparisonRows,
  yearlySaving,
  priceText,
} from './format';

import type { Grant } from '@/api/endpoints';

const grant = (overrides: Partial<Grant> = {}): Grant => ({
  id: 'g1',
  plan: 'pro',
  feature: null,
  starts_at: '2026-01-01T12:00:00Z',
  ends_at: '2026-01-31T12:00:00Z',
  reason: 'Welcome gift',
  granted_by: 'boss',
  created_at: '2026-01-01T12:00:00Z',
  revoked_at: null,
  active: true,
  paid: false,
  ...overrides,
});

test('plans and prices in words', () => {
  expect(PLANS.map(priceText)).toEqual([
    'Free for everyone',
    '₹149 a month · ₹1,490 a year',
    '₹299 a month · ₹2,990 a year',
  ]);
  expect(myPlanText(FREE)).toBe('You are on the Free plan.');
  expect(myPlanText(PLUS_UNTIL)).toBe('You have ClawPlay Plus until 1 Feb 2026.');
  expect(myPlanText({ ...PLUS_UNTIL, plan: 'pro', plan_until: null })).toBe(
    'You have ClawPlay Pro.',
  );
  expect(myPlanText(FREE, 'alice')).toBe('alice is on the Free plan.');
  expect(myPlanText(PLUS_UNTIL, 'alice')).toBe('alice has ClawPlay Plus until 1 Feb 2026.');
  // Plan time waiting for a better plan to end follows it.
  const waiting = [
    grant({ plan: 'plus', starts_at: '2026-02-01T12:00:00Z', ends_at: '2026-03-03T12:00:00Z' }),
    grant({ plan: 'plus', starts_at: '2026-03-03T12:00:00Z', ends_at: '2026-04-02T12:00:00Z' }),
    grant({ plan: null, feature: 'themes', ends_at: null }),
  ];
  expect(myPlanText({ ...PLUS_UNTIL, plan: 'pro', waiting })).toBe(
    'You have ClawPlay Pro until 1 Feb 2026. Then ClawPlay Plus until 2 Apr 2026.',
  );
  expect(myPlanText({ ...FREE, waiting: waiting.slice(0, 1) })).toBe(
    'You are on the Free plan. Then ClawPlay Plus until 3 Mar 2026.',
  );
  expect(myPlanText({ ...PLUS_UNTIL, waiting })).toBe('You have ClawPlay Plus until 1 Feb 2026.');
});

test('features, and the ones still being built', () => {
  expect(featureText('computer_hard')).toBe('Play the Hard computer');
  expect(featureText('trainer')).toBe('Opening and endgame trainer');
  expect(has(PLUS_UNTIL, 'computer_hard')).toBe(true);
  expect(has(FREE, 'computer_hard')).toBe(false);
  expect(has(undefined, 'computer_hard')).toBe(false);
});

test('grants in words', () => {
  expect(grantText(grant())).toBe('ClawPlay Pro · until 31 Jan 2026 · given by boss: Welcome gift');
  expect(
    grantText(
      grant({
        plan: 'plus',
        paid: true,
        granted_by: null,
        reason: 'Paid ₹149 for a month (pay_1)',
      }),
    ),
  ).toBe('ClawPlay Plus · until 31 Jan 2026 · Paid ₹149 for a month (pay_1)');
  expect(grantText(grant({ plan: null, feature: 'themes', ends_at: null }))).toBe(
    'Board and coin themes, and sound packs · until revoked · given by boss: Welcome gift',
  );
  expect(grantText(grant({ active: false, granted_by: null }))).toBe(
    'ClawPlay Pro · ended 31 Jan 2026 · given by a former admin: Welcome gift',
  );
  expect(grantText(grant({ revoked_at: '2026-01-05T09:00:00Z', active: false }))).toContain(
    'revoked 5 Jan 2026',
  );
  expect(grantText(grant({ plan: null, feature: null }))).toMatch(/^Access ·/);
  const now = Date.parse('2026-01-01T12:00:00Z');
  expect(grantText(grant({ active: false, starts_at: '2026-01-10T12:00:00Z' }), now)).toBe(
    'ClawPlay Pro · from 10 Jan 2026 until 31 Jan 2026 · given by boss: Welcome gift',
  );
});

test('what an admin can grant, and for how long', () => {
  expect(GRANTABLE.slice(0, 2).map((g) => g.value)).toEqual(['plus', 'pro']);
  expect(GRANTABLE).toHaveLength(9);
  expect(grantBody('pro')).toEqual({ plan: 'pro' });
  expect(grantBody('feature:trainer')).toEqual({ feature: 'trainer' });
  expect(DURATIONS.map((d) => d.days)).toEqual([7, 30, 90, 365, null]);
});

test('the plans side by side, from the server', () => {
  const rows = comparisonRows(PLANS);
  expect(rows[0]).toEqual({ label: 'Live and rated games, quick pairing', cells: ['✓', '✓', '✓'] });
  const row = (label: string) => rows.find((r) => r.label === label)?.cells;
  expect(row('Play the Hard computer')).toEqual(['—', '✓', '✓']);
  expect(row('Your whole game history')).toEqual(['30 days', '✓', '✓']);
  expect(row('The engine’s review of your finished games')).toEqual(['—', '5 a day', '✓']);
  expect(row('Opening and endgame trainer')).toEqual(['—', '—', '✓']);
});

test('the yearly saving', () => {
  expect(yearlySaving(PLANS[0]!)).toBeNull();
  expect(yearlySaving(PLANS[1]!)).toBe('2 months free when you pay for a year');
  expect(yearlySaving({ ...PLANS[1]!, yearly_paise: 163900 })).toBe(
    '1 month free when you pay for a year',
  );
  expect(yearlySaving({ ...PLANS[1]!, yearly_paise: 178800 })).toBeNull();
});

test('the plan that has a feature: the cheapest, from the server’s list', () => {
  expect(planFor(PLANS, 'analysis')).toBe('plus');
  expect(planFor(PLANS, 'trainer')).toBe('pro');
  expect(planFor([], 'analysis')).toBeNull();
});
