import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform, Share } from 'react-native';

import { renderApp, savedUsername } from './support/app';
import { LINK_TOKEN, ME, error, type Route } from './support/fakeServer';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };

afterEach(() => jest.restoreAllMocks());

const SECTIONS: Record<string, string> = {
  'Email address': 'email',
  Password: 'password',
  'Your data': 'data',
  'Delete account': 'delete',
};

/** One part of the account, on its own screen (in the apps; the web folds them into one page). */
async function account(section: string, routes: Record<string, Route> = {}) {
  return renderApp(`/settings/${SECTIONS[section]!}`, {
    token: 'tok',
    routes: { ...SIGNED_IN, ...routes },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

test('the Me tab leads to the settings', async () => {
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
  await screen.findByRole('button', { name: 'Settings' });
  await press('Settings');
  expect(await screen.findByRole('link', { name: 'Account' })).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/settings');
});

test('in the apps, settings are a short list, each row its own screen', async () => {
  const { app } = await renderApp('/settings', { token: 'tok', routes: SIGNED_IN });
  for (const row of ['Board, pieces and sounds', 'Language', 'Plan', 'Terms of service']) {
    expect(await screen.findByRole('link', { name: row })).toBeOnTheScreen();
  }
  expect(screen.queryByRole('button', { name: 'Email address' })).toBeNull();
  await fireEvent.press(screen.getByRole('link', { name: 'Account' }));
  await waitFor(() => expect(app.getPathname()).toBe('/settings/account'));
  for (const row of ['Email address', 'Password', 'Blocked players', 'Your data']) {
    expect(await screen.findByRole('link', { name: row })).toBeOnTheScreen();
  }
  await fireEvent.press(screen.getByRole('link', { name: 'Delete account' }));
  await waitFor(() => expect(app.getPathname()).toBe('/settings/delete'));
  expect(await screen.findByRole('button', { name: 'Delete my account…' })).toBeOnTheScreen();
});

test('on the web, settings are one page, the account folded shut', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await renderApp('/settings', { token: 'tok', routes: SIGNED_IN });
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Email address', expanded: false }),
  );
  expect(await screen.findByText('Your email address is alice@example.com.')).toBeOnTheScreen();
});

describe('changing the email address', () => {
  test('sends a link to the new address', async () => {
    const { server } = await account('Email address', {
      'POST /api/v1/me/email': { status: 202, body: { status: 'accepted' } },
    });
    await screen.findByText('Your email address is alice@example.com.');
    await type('New email address', ' new@example.org ');
    await type('Your password', 'secret');
    await press('Send a confirmation link');
    expect(
      await screen.findByText('Link sent to new@example.org. Open it to change your address.'),
    ).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/email').body).toEqual({
      password: 'secret',
      email: 'new@example.org',
    });
  });

  test('checks the form, then shows what the server said', async () => {
    const { server } = await account('Email address', {
      'POST /api/v1/me/email': error(403, 'wrong_password', 'That is not your current password.'),
    });
    await screen.findByText('Your email address is alice@example.com.');
    await type('New email address', 'ALICE@example.com');
    await press('Send a confirmation link');
    expect(screen.getByText('That is already your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(server.requests.some((r) => r.path === '/api/v1/me/email')).toBe(false);

    await type('New email address', 'new@example.org');
    await type('Your password', 'wrong');
    await press('Send a confirmation link');
    expect(await screen.findByText('That is not your current password.')).toBeOnTheScreen();
  });
});

describe('changing the password', () => {
  test('changes it and clears the form', async () => {
    const { server } = await account('Password', { 'POST /api/v1/me/password': { status: 204 } });
    await type('Current password', 'old password');
    await type('New password', 'a brand new one');
    await type('Repeat the new password', 'a brand new one');
    await press('Change password');
    expect(
      await screen.findByText('Password changed. Your other devices are signed out.'),
    ).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/password').body).toEqual({
      current_password: 'old password',
      new_password: 'a brand new one',
    });
    expect(screen.getByLabelText('Current password')).toHaveDisplayValue('');
  });

  test('checks the form, then shows what the server said', async () => {
    await account('Password', {
      'POST /api/v1/me/password': error(
        403,
        'wrong_password',
        'That is not your current password.',
      ),
    });
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
    await account('Your data', { 'GET /api/v1/me/export': { status: 200, body: data } });
    await press('Download my data');
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: 'clawplay-alice.json',
        message: JSON.stringify(data, null, 2),
      }),
    );
    share.mockRestore();
  });

  test('a failure is reported', async () => {
    await account('Your data', {
      'GET /api/v1/me/export': error(429, 'rate_limited', 'Too many requests. Try again later.'),
    });
    await press('Download my data');
    expect(await screen.findByText('Too many requests. Try again later.')).toBeOnTheScreen();
  });
});

describe('deleting the account', () => {
  test('asks for the password, then signs out', async () => {
    const { server } = await account('Delete account', {
      'POST /api/v1/me/delete': { status: 204 },
    });
    await press('Delete my account…');
    await press('Keep my account');
    expect(screen.queryByLabelText('Your password')).toBeNull();

    await press('Delete my account…');
    await press('Delete my account for good');
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    await type('Your password', 'secret');
    await press('Delete my account for good');
    // The account is gone: this device forgets its username too, and shows the start screen.
    expect(await screen.findByRole('button', { name: 'Sign up' })).toBeOnTheScreen();
    expect(savedUsername()).toBeNull();
    expect(server.lastTo('POST /api/v1/me/delete').body).toEqual({ password: 'secret' });
  });

  test('explains why it cannot be done yet', async () => {
    await account('Delete account', {
      'POST /api/v1/me/delete': error(
        409,
        'game_in_progress',
        'Finish or resign your live game before deleting your account.',
      ),
    });
    await press('Delete my account…');
    await type('Your password', 'secret');
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
