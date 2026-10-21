import type { Payment } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { setLanguage } from '@/i18n';

import { buyErrorText, buyLabel, keysText, paymentText, rupees, thanksText } from './format';
import { CheckoutClosed } from './razorpay';

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  plan: 'plus',
  period: 'month',
  amount_paise: 14900,
  status: 'paid',
  created_at: '2026-10-18T12:00:00Z',
  paid_at: '2026-10-18T12:01:00Z',
  starts: '2026-10-18T12:01:00Z',
  until: '2026-11-17T12:01:00Z',
  ...overrides,
});

test('prices and buttons', () => {
  expect(rupees(149000)).toBe('₹1,490');
  expect(rupees(14950)).toBe('₹149.5');
  setLanguage('ar');
  try {
    expect(rupees(149000)).toBe('₹1,490');
  } finally {
    setLanguage('en');
  }
  const plus = {
    plan: 'plus' as const,
    name: 'Plus',
    features: [],
    monthly_paise: 14900,
    yearly_paise: 149000,
    games: null,
    analyses_per_day: 5,
  };
  expect(buyLabel(plus, 'month')).toBe('Buy a month · ₹149');
  expect(buyLabel(plus, 'year')).toBe('Buy a year · ₹1,490');
  expect(buyLabel({ ...plus, yearly_paise: null }, 'year')).toBe('Buy a year · ₹0');
  expect(buyLabel({ ...plus, games: 45 }, 'month')).toBe('Buy 45 games or a month · ₹149');
  expect(buyLabel({ ...plus, games: 45 }, 'year')).toBe('Buy 45 games or a year · ₹1,490');
});

test('thanks and the record', () => {
  expect(thanksText(payment())).toBe('Thank you! You have ClawPlay Plus until 17 Nov 2026.');
  expect(thanksText(payment({ plan: 'pro', until: null }))).toBe(
    'Thank you! You have ClawPlay Pro.',
  );
  expect(
    thanksText(payment({ starts: '2026-12-01T12:00:00Z', until: '2026-12-31T12:00:00Z' })),
  ).toBe(
    'Thank you! Your ClawPlay Plus starts on 1 Dec 2026, after the plan time you already have, and runs until 31 Dec 2026.',
  );
  expect(thanksText(payment({ starts: '2026-12-01T12:00:00Z', until: null }))).toBe(
    'Thank you! Your ClawPlay Plus starts on 1 Dec 2026, after the plan time you already have, and runs.',
  );
  expect(paymentText(payment(), 45)).toMatch(/^ClawPlay Plus for 45 games or a month · /);
  expect(paymentText(payment({ period: 'year' }), 45)).toMatch(
    /^ClawPlay Plus for 45 games or a year · /,
  );
  expect(paymentText(payment())).toBe('ClawPlay Plus for a month · ₹149 · 18 Oct 2026 · paid');
  expect(paymentText(payment({ status: 'refunded' }))).toMatch(/· refunded$/);
  expect(paymentText(payment({ status: 'reversed' }))).toMatch(/· reversed by the bank$/);
  expect(paymentText(payment({ period: 'year', status: 'failed' }))).toBe(
    'ClawPlay Plus for a year · ₹149 · 18 Oct 2026 · not paid',
  );
});

test('what went wrong, if anything', () => {
  expect(buyErrorText(new CheckoutClosed(null))).toBeNull();
  expect(buyErrorText(new CheckoutClosed('Card declined'))).toBe('Card declined');
  expect(buyErrorText(new ApiError(502, 'payment_provider_error', 'Try later.'))).toBe(
    'Try later.',
  );
  expect(buyErrorText(new Error('Razorpay could not be loaded.'))).toBe(
    'Razorpay could not be loaded.',
  );
  expect(buyErrorText('odd')).toBe('Something went wrong. Please try again.');
});

test('the payment keys in words', () => {
  const page = {
    on: true,
    key_id: 'rzp_test_abcdef1',
    updated_at: '2026-10-20T10:00:00Z',
    updated_by: null,
    can_store: true,
    webhook_url: 'https://x/api/v1/payments/webhook',
  };
  expect(keysText(page)).toMatch(
    /^Payments are on, with the test keys rzp_test_abcdef1 \(set by a former admin, /,
  );
  const live = { ...page, key_id: 'rzp_live_abcdef1', updated_by: 'boss' };
  expect(keysText(live)).toMatch(
    /^Payments are on, with the live keys rzp_live_abcdef1 \(set by boss, /,
  );
  expect(keysText({ ...live, updated_at: null })).toBe(
    'Payments are on, with the live keys rzp_live_abcdef1.',
  );
  expect(keysText({ ...page, updated_at: null })).toBe(
    'Payments are on, with the test keys rzp_test_abcdef1.',
  );
  expect(keysText({ ...page, on: false })).toMatch(/^Payments are off: the keys stored \(set by /);
  expect(keysText({ ...page, on: false, updated_at: null })).toBe(
    "Payments are off: the keys stored cannot be read with the server's secrets key. Enter them again.",
  );
  expect(keysText({ ...page, on: false, key_id: null })).toBe(
    'Payments are off: the plans page says paying online is coming soon.',
  );
});
