import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Share } from 'react-native';

import { renderApp } from './support/app';
import { LINK_TOKEN, ME, error, type Route } from './support/fakeServer';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };

function account(routes: Record<string, Route> = {}) {
  return renderApp('/account', { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

test('the Me tab links to the account settings', async () => {
  const { app } = await renderApp('/me', {
    token: 'tok',
    routes: {
      ...SIGNED_IN,
      'GET /api/v1/players/alice': {
        status: 200,
        body: { ...ME, online: true, playing: false, blocked: false, ratings: {} },
      },
      'GET /api/v1/blocks': { status: 200, body: [] },
    },
  });
  await screen.findByRole('button', { name: 'Account settings' });
  await press('Account settings');
  expect(await screen.findByText('Your email address is alice@example.com.')).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/account');
});

describe('changing the email address', () => {
  test('sends a link to the new address', async () => {
    const { server } = await account({
      'POST /api/v1/me/email': { status: 202, body: { status: 'accepted' } },
    });
    await screen.findByText('Your email address is alice@example.com.');
    await type('New email address', ' new@example.org ');
    await type('Your password (to change the email address)', 'secret');
    await press('Send a confirmation link');
    expect(
      await screen.findByText(
        'We sent a link to new@example.org. Your address changes when you open it.',
      ),
    ).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/email').body).toEqual({
      password: 'secret',
      email: 'new@example.org',
    });
  });

  test('checks the form, then shows what the server said', async () => {
    const { server } = await account({
      'POST /api/v1/me/email': error(403, 'wrong_password', 'That is not your current password.'),
    });
    await screen.findByText('Your email address is alice@example.com.');
    await type('New email address', 'ALICE@example.com');
    await press('Send a confirmation link');
    expect(screen.getByText('That is already your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(server.requests.some((r) => r.path === '/api/v1/me/email')).toBe(false);

    await type('New email address', 'new@example.org');
    await type('Your password (to change the email address)', 'wrong');
    await press('Send a confirmation link');
    expect(await screen.findByText('That is not your current password.')).toBeOnTheScreen();
  });
});

describe('changing the password', () => {
  test('changes it and clears the form', async () => {
    const { server } = await account({ 'POST /api/v1/me/password': { status: 204 } });
    await screen.findByText('Your email address is alice@example.com.');
    await type('Current password', 'old password');
    await type('New password', 'a brand new one');
    await type('Repeat the new password', 'a brand new one');
    await press('Change password');
    expect(
      await screen.findByText(
        'Your password has been changed. Your other devices have been signed out.',
      ),
    ).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/password').body).toEqual({
      current_password: 'old password',
      new_password: 'a brand new one',
    });
    expect(screen.getByLabelText('Current password')).toHaveDisplayValue('');
  });

  test('checks the form, then shows what the server said', async () => {
    await account({
      'POST /api/v1/me/password': error(
        403,
        'wrong_password',
        'That is not your current password.',
      ),
    });
    await screen.findByText('Your email address is alice@example.com.');
    await type('New password', 'short');
    await press('Change password');
    expect(screen.getByText('Enter your current password.')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 10 characters.')).toBeOnTheScreen();

    await type('Current password', 'wrong');
    await type('New password', 'a brand new one');
    await type('Repeat the new password', 'a brand new one');
    await press('Change password');
    expect(await screen.findByText('That is not your current password.')).toBeOnTheScreen();
  });
});

describe('downloading my data', () => {
  test('fetches the export and hands it over', async () => {
    const data = { account: { username: 'alice' }, games: [] };
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await account({ 'GET /api/v1/me/export': { status: 200, body: data } });
    await screen.findByText('Your email address is alice@example.com.');
    await press('Download my data');
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: 'baghchal-alice.json',
        message: JSON.stringify(data, null, 2),
      }),
    );
    share.mockRestore();
  });

  test('a failure is reported', async () => {
    await account({
      'GET /api/v1/me/export': error(429, 'rate_limited', 'Too many requests. Try again later.'),
    });
    await screen.findByText('Your email address is alice@example.com.');
    await press('Download my data');
    expect(await screen.findByText('Too many requests. Try again later.')).toBeOnTheScreen();
  });
});

describe('deleting the account', () => {
  test('asks for the password, then signs out', async () => {
    const { server } = await account({ 'POST /api/v1/me/delete': { status: 204 } });
    await screen.findByText('Your email address is alice@example.com.');
    await press('Delete my account…');
    await press('Keep my account');
    expect(screen.queryByLabelText('Your password (to delete your account)')).toBeNull();

    await press('Delete my account…');
    await press('Delete my account for good');
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    await type('Your password (to delete your account)', 'secret');
    await press('Delete my account for good');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/delete').body).toEqual({ password: 'secret' });
  });

  test('explains why it cannot be done yet', async () => {
    await account({
      'POST /api/v1/me/delete': error(
        409,
        'game_in_progress',
        'Finish or resign your live game before deleting your account.',
      ),
    });
    await screen.findByText('Your email address is alice@example.com.');
    await press('Delete my account…');
    await type('Your password (to delete your account)', 'secret');
    await press('Delete my account for good');
    expect(
      await screen.findByText('Finish or resign your live game before deleting your account.'),
    ).toBeOnTheScreen();
  });
});

describe('the link sent to a new address', () => {
  const CONFIRM = 'POST /api/v1/auth/confirm-email';

  test('signed in: confirms and shows the new address', async () => {
    const { server } = await renderApp(`/confirm-email?token=${LINK_TOKEN}`, {
      token: 'tok',
      routes: { ...SIGNED_IN, [CONFIRM]: { status: 200, body: { email: 'new@example.org' } } },
    });
    expect(await screen.findByText('Your account now uses new@example.org.')).toBeOnTheScreen();
    expect(screen.getByText('Back to your account')).toBeOnTheScreen();
    expect(server.lastTo(CONFIRM).body).toEqual({ token: LINK_TOKEN });
    // The session was asked again, so the Me tab shows the new address.
    expect(server.requests.filter((r) => r.path === '/api/v1/me')).toHaveLength(2);
  });

  test('signed out: confirms and offers to sign in', async () => {
    await renderApp(`/confirm-email?token=${LINK_TOKEN}`, {
      routes: { [CONFIRM]: { status: 200, body: { email: 'new@example.org' } } },
    });
    expect(await screen.findByText('Your account now uses new@example.org.')).toBeOnTheScreen();
    expect(screen.getByText('Sign in')).toBeOnTheScreen();
  });

  test('a used link, a taken address, a broken link', async () => {
    await renderApp(`/confirm-email?token=${LINK_TOKEN}`, {
      routes: {
        [CONFIRM]: error(409, 'email_taken', 'That email address now belongs to another account.'),
      },
    });
    expect(
      await screen.findByText('That email address now belongs to another account.'),
    ).toBeOnTheScreen();

    await renderApp('/confirm-email?token=nope');
    expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
  });
});
