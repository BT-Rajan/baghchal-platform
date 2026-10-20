import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';

import type { PaymentKeys } from '@/api/endpoints';

const ADMIN = { 'GET /api/v1/me': { status: 200, body: { ...ME, role: 'admin' } } };
const OFF: PaymentKeys = {
  on: false,
  key_id: null,
  updated_at: null,
  updated_by: null,
  can_store: true,
  webhook_url: 'https://clawplay.example/api/v1/payments/webhook',
};
const ON: PaymentKeys = {
  ...OFF,
  on: true,
  key_id: 'rzp_live_abcdef123',
  updated_at: '2026-10-20T10:00:00Z',
  updated_by: 'boss',
};

function open(routes: Record<string, Route>) {
  return renderApp('/admin/payments', { token: 'tok', routes: { ...ADMIN, ...routes } });
}

test('admins reach the payments page from settings', async () => {
  const { app } = await renderApp('/settings', {
    token: 'tok',
    routes: { ...ADMIN, 'GET /api/v1/admin/payment-keys': { status: 200, body: OFF } },
  });
  await fireEvent.press(await screen.findByRole('link', { name: 'Payments' }));
  await waitFor(() => expect(app.getPathname()).toBe('/admin/payments'));
});

test('the page opens with a code sent by email', async () => {
  let checked = false;
  const { server } = await open({
    'GET /api/v1/admin/payment-keys': () =>
      checked ? { status: 200, body: OFF } : error(403, 'admin_code_needed', 'Enter the code.'),
    'POST /api/v1/admin/code': { status: 202, body: { status: 'accepted' } },
    'POST /api/v1/admin/code/check': (request) => {
      if ((request.body as { code: string }).code !== '123456')
        return error(400, 'wrong_code', 'That code is wrong or has expired.');
      checked = true;
      return { status: 200, body: { until: '2026-10-20T10:15:00Z' } };
    },
  });
  await fireEvent.press(await screen.findByRole('button', { name: 'Email me a code' }));
  expect(await screen.findByText('We have emailed you a code.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Send another code' }));
  await waitFor(() =>
    expect(server.requests.filter((r) => r.path === '/api/v1/admin/code')).toHaveLength(2),
  );
  const open_ = screen.getByRole('button', { name: 'Open the payment keys' });
  expect(open_).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Code'), '12 34 50');
  await fireEvent.press(open_);
  expect(await screen.findByText('That code is wrong or has expired.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Open the payment keys' }));
  expect(
    await screen.findByText('Payments are off: the plans page says paying online is coming soon.'),
  ).toBeOnTheScreen();
  expect(server.lastTo('POST /api/v1/admin/code/check').body).toEqual({ code: '123456' });
});

test('setting the keys, and turning payments off', async () => {
  let page = OFF;
  const { server } = await open({
    'GET /api/v1/admin/payment-keys': () => ({ status: 200, body: page }),
    'PUT /api/v1/admin/payment-keys': () => {
      page = ON;
      return { status: 200, body: ON };
    },
    'DELETE /api/v1/admin/payment-keys': () => {
      page = OFF;
      return { status: 200, body: OFF };
    },
  });
  expect(await screen.findByText(OFF.webhook_url)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Key id'), 'sk_live_x');
  await fireEvent.press(screen.getByRole('button', { name: 'Save the keys' }));
  expect(await screen.findByText('The key id starts rzp_test_ or rzp_live_.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Key id'), ' rzp_live_abcdef123 ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save the keys' }));
  expect(await screen.findByText('Enter the key secret.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Key secret'), 'live-secret-1');
  await fireEvent.press(screen.getByRole('button', { name: 'Save the keys' }));
  expect(
    await screen.findByText('Enter the webhook secret (at least 8 characters).'),
  ).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Webhook secret'), 'hook-secret-1');
  await fireEvent.press(screen.getByRole('button', { name: 'Save the keys' }));
  expect(
    await screen.findByText(/^Payments are on, with the live keys rzp_live_abcdef123/),
  ).toBeOnTheScreen();
  expect(server.lastTo('PUT /api/v1/admin/payment-keys').body).toEqual({
    key_id: 'rzp_live_abcdef123',
    key_secret: 'live-secret-1',
    webhook_secret: 'hook-secret-1',
  });
  expect(screen.getByLabelText('Key secret')).toHaveDisplayValue('');

  await fireEvent.press(screen.getByRole('button', { name: 'Turn payments off' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Turn payments off' }));
  expect(screen.getByText(/^Turn payments off\? Players cannot buy/)).toBeOnTheScreen();
  const buttons = screen.getAllByRole('button', { name: 'Turn payments off' });
  await fireEvent.press(buttons[0]!);
  expect(
    await screen.findByText('Payments are off: the plans page says paying online is coming soon.'),
  ).toBeOnTheScreen();
});

test('without the secrets key, or with keys it cannot read', async () => {
  await open({
    'GET /api/v1/admin/payment-keys': {
      status: 200,
      body: { ...OFF, can_store: false, key_id: 'rzp_test_abcdef1', updated_at: ON.updated_at },
    },
  });
  expect(await screen.findByText(/^Set BAGHCHAL_SECRETS_KEY on the server/)).toBeOnTheScreen();
  expect(screen.getByText(/cannot be read with the server's secrets key/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Save the keys' })).toBeDisabled();
});

test('other errors can be retried', async () => {
  await open({ 'GET /api/v1/admin/payment-keys': error(500, 'internal', 'Something broke.') });
  expect(await screen.findByRole('button', { name: /try again/i })).toBeOnTheScreen();
});
