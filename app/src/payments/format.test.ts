import type { Payment } from '@/api/endpoints';
import { ApiError } from '@/api/errors';

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
});

test('thanks and the record', () => {
  expect(thanksText(payment())).toBe('Thank you! You have ClawPlay Plus until 17 Nov 2026.');
  expect(thanksText(payment({ plan: 'pro', until: null }))).toBe(
    'Thank you! You have ClawPlay Pro.',
  );
  expect(
    thanksText(payment({ starts: '2026-12-01T12:00:00Z', until: '2026-12-31T12:00:00Z' })),
  ).toBe(
    'Thank you! Your ClawPlay Plus starts on 1 Dec 2026, when your better plan ends, and runs until 31 Dec 2026.',
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
});
