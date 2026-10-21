import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { PLUS_UNTIL } from './support/plans';

import type { Checkout, Payment } from '@/api/endpoints';

interface Opened {
  options: {
    order_id: string;
    handler: (response: unknown) => void;
    modal: { ondismiss: () => void };
  };
  failed: (response: { error: { description: string } }) => void;
}

let opened: Opened[] = [];

class FakeRazorpay {
  constructor(options: Opened['options']) {
    opened.push({ options, failed: () => {} });
  }
  on(_: string, listener: Opened['failed']) {
    opened.at(-1)!.failed = listener;
  }
  open() {}
}

const ORDER: Checkout = {
  key_id: 'rzp_test_k',
  order_id: 'order_1',
  amount_paise: 14900,
  currency: 'INR',
  name: 'ClawPlay',
  description: 'ClawPlay Plus for 45 games or a month',
  email: 'alice@example.com',
  username: 'alice',
};
const PAID: Payment = {
  id: 'p1',
  plan: 'plus',
  period: 'month',
  amount_paise: 14900,
  status: 'paid',
  created_at: '2026-01-01T12:00:00Z',
  paid_at: '2026-01-01T12:01:00Z',
  starts: '2026-01-01T12:01:00Z',
  until: '2026-01-31T12:01:00Z',
};

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'web'); // buying happens on the website
  opened = [];
  (globalThis as { Razorpay?: unknown }).Razorpay = FakeRazorpay;
});
afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { Razorpay?: unknown }).Razorpay;
});

function open(routes: Record<string, Route> = {}) {
  return renderApp('/plans', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/me/payments': { status: 200, body: { enabled: true, payments: [] } },
      'POST /api/v1/payments/checkout': { status: 201, body: ORDER },
      ...routes,
    },
  });
}

test('buy Plus: 45 games or a month', async () => {
  let paid = false;
  const { server } = await open({
    'POST /api/v1/payments/verify': () => {
      paid = true;
      return { status: 200, body: PAID };
    },
    'GET /api/v1/me/plan': () =>
      paid
        ? { status: 200, body: PLUS_UNTIL }
        : {
            status: 200,
            body: { plan: 'free', plan_until: null, features: [], grants: [], waiting: [] },
          },
    'GET /api/v1/me/payments': () => ({
      status: 200,
      body: { enabled: true, payments: paid ? [PAID] : [] },
    }),
  });
  expect(await screen.findByText(/^Payments are taken by Razorpay: cards, UPI/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Buy ClawPlay Pro for a month' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Buy ClawPlay Pro for a year')).toHaveTextContent(
    'Buy a year · ₹2,990',
  );
  expect(screen.queryByRole('button', { name: 'Buy ClawPlay Plus for a year' })).toBeNull();
  expect(screen.getByLabelText('Buy ClawPlay Plus for a month')).toHaveTextContent(
    'Buy 45 games or a month · ₹149',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Buy ClawPlay Plus for a month' }));
  await waitFor(() => expect(opened).toHaveLength(1));
  expect(server.lastTo('POST /api/v1/payments/checkout').body).toEqual({
    plan: 'plus',
    period: 'month',
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Buy ClawPlay Pro for a month' })).toBeDisabled(),
  );

  await act(() =>
    opened[0]!.options.handler({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig',
    }),
  );
  expect(
    await screen.findByText('Thank you! You have ClawPlay Plus until 31 Jan 2026.'),
  ).toBeOnTheScreen();
  expect(server.lastTo('POST /api/v1/payments/verify').body).toEqual({
    order_id: 'order_1',
    payment_id: 'pay_1',
    signature: 'sig',
  });
  expect(
    await screen.findByText('ClawPlay Plus for 45 games or a month · ₹149 · 1 Jan 2026 · paid'),
  ).toBeOnTheScreen();
  expect(await screen.findByLabelText('Plus, your plan')).toBeOnTheScreen();
});

test('closing the window says nothing; a failed payment says why', async () => {
  await open();
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Buy ClawPlay Pro for a month' }),
  );
  await waitFor(() => expect(opened).toHaveLength(1));
  await act(() => opened[0]!.options.modal.ondismiss());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Buy ClawPlay Pro for a month' })).toBeEnabled(),
  );
  expect(screen.queryByText(/declined/)).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Buy ClawPlay Pro for a month' }));
  await waitFor(() => expect(opened).toHaveLength(2));
  await act(() => {
    opened[1]!.failed({ error: { description: 'Your card was declined.' } });
    opened[1]!.options.modal.ondismiss();
  });
  expect(await screen.findByText('Your card was declined.')).toBeOnTheScreen();
});

test('when Razorpay is out of reach', async () => {
  await open({
    'POST /api/v1/payments/checkout': error(502, 'payment_provider_error', 'Try later.'),
  });
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Buy ClawPlay Plus for a month' }),
  );
  expect(await screen.findByText('Try later.')).toBeOnTheScreen();
  expect(opened).toHaveLength(0);
});

test('payments off: no buttons', async () => {
  await renderApp('/plans', {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: ME } },
  });
  expect(await screen.findByText(/^Paying online is coming soon/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /^Buy/ })).toBeNull();
});

test('Plus bought on Pro waits for Pro to end', async () => {
  const pro = { ...PLUS_UNTIL, plan: 'pro' as const, plan_until: '2027-01-01T12:00:00Z' };
  await open({
    'GET /api/v1/me/plan': { status: 200, body: pro },
    'POST /api/v1/payments/verify': {
      status: 200,
      body: { ...PAID, starts: '2027-01-01T12:00:00Z', until: '2027-01-31T12:00:00Z' },
    },
  });
  expect(
    await screen.findByText('Starts when your Pro ends, so none of it is spent underneath it.'),
  ).toBeOnTheScreen();
  expect(screen.getAllByText(/^Starts when your Pro ends/)).toHaveLength(1); // only on Plus
  await fireEvent.press(screen.getByRole('button', { name: 'Buy ClawPlay Plus for a month' }));
  await waitFor(() => expect(opened).toHaveLength(1));
  await act(() =>
    opened[0]!.options.handler({
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig',
    }),
  );
  expect(
    await screen.findByText(
      'Thank you! Your ClawPlay Plus starts on 1 Jan 2027, after the plan time you already have, and runs until 31 Jan 2027.',
    ),
  ).toBeOnTheScreen();
});

test('the apps show what plans include, with no prices and nowhere to buy', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { server } = await open();
  expect(await screen.findByRole('heading', { name: 'Plus' })).toBeOnTheScreen();
  expect(screen.queryByText(/₹/)).toBeNull();
  expect(screen.queryByText(/website/i)).toBeNull();
  expect(screen.queryByText(/Razorpay/)).toBeNull();
  expect(screen.queryByRole('button', { name: /^Buy/ })).toBeNull();
  expect(screen.getByText(/^Plus lasts 45 finished games or a month/)).toBeOnTheScreen();
  expect(server.requests.some((r) => r.path === '/api/v1/payments/checkout')).toBe(false);
});
