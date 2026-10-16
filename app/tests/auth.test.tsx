import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp, savedToken } from './support/app';
import { LINK_TOKEN, ME, error } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

test('someone signed out is sent to sign-in', async () => {
  const { app } = await renderApp('/');
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/sign-in');
});

test('a saved session opens the signed-in home', async () => {
  await renderApp('/', { token: 'tok', routes: SIGNED_IN });
  expect(await screen.findByText('Signed in as alice.')).toBeOnTheScreen();
});

describe('sign in', () => {
  test('checks the form before asking the server', async () => {
    const { server } = await renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Sign in' });
    await press('Sign in');
    expect(screen.getByText('Enter your username or email.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(server.requests).toHaveLength(0);
  });

  test("shows the server's answer for wrong credentials", async () => {
    await renderApp('/sign-in', {
      routes: {
        'POST /api/v1/auth/login': error(
          401,
          'invalid_credentials',
          'Wrong username, email or password.',
        ),
      },
    });
    await screen.findByRole('heading', { name: 'Sign in' });
    await type('Username or email', 'alice');
    await type('Password', 'not it');
    await press('Sign in');
    expect(await screen.findByText('Wrong username, email or password.')).toBeOnTheScreen();
  });

  test('signs in, keeps the token, and opens home; signing out returns', async () => {
    const { server, app } = await renderApp('/sign-in', {
      routes: {
        'POST /api/v1/auth/login': { status: 200, body: { user: ME, token: 'new-token' } },
        'POST /api/v1/auth/logout': { status: 204 },
      },
    });
    await screen.findByRole('heading', { name: 'Sign in' });
    await type('Username or email', 'alice');
    await type('Password', 'correct horse');
    await press('Sign in');
    expect(await screen.findByText('Signed in as alice.')).toBeOnTheScreen();
    expect(server.last().body).toEqual({
      login: 'alice',
      password: 'correct horse',
      transport: 'bearer',
    });
    expect(savedToken()).toBe('new-token');

    await press('Sign out');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/sign-in');
    expect(savedToken()).toBeNull();
  });
});

describe('sign up', () => {
  async function fill(username: string, email: string, password: string) {
    await screen.findByRole('heading', { name: 'Create an account' });
    await type('Username', username);
    await type('Email', email);
    await type('Password', password);
    await press('Create account');
  }

  test('checks the form before asking the server', async () => {
    const { server } = await renderApp('/sign-up');
    await fill('a', 'nope', 'short');
    expect(screen.getByText(/3–20 letters/)).toBeOnTheScreen();
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 10 characters.')).toBeOnTheScreen();
    expect(server.requests).toHaveLength(0);
  });

  test('puts a taken username on the username field', async () => {
    await renderApp('/sign-up', {
      routes: {
        'POST /api/v1/auth/register': error(409, 'username_taken', 'That username is taken.'),
      },
    });
    await fill('alice', 'alice@example.com', 'correct horse');
    expect(await screen.findByText('That username is taken.')).toBeOnTheScreen();
  });

  test('asks the new player to check their email', async () => {
    const { server } = await renderApp('/sign-up', {
      routes: { 'POST /api/v1/auth/register': { status: 202, body: { status: 'accepted' } } },
    });
    await fill('alice', ' alice@example.com ', 'correct horse');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeOnTheScreen();
    expect(server.last().body).toEqual({
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse',
    });
  });

  test('reports a server it cannot reach', async () => {
    await renderApp('/sign-up', {
      routes: {
        'POST /api/v1/auth/register': () => {
          throw new TypeError('Network request failed');
        },
      },
    });
    await fill('alice', 'alice@example.com', 'correct horse');
    expect(await screen.findByText(/Cannot reach the server/)).toBeOnTheScreen();
  });
});

test('forgot password sends a link', async () => {
  const { server } = await renderApp('/forgot-password', {
    routes: { 'POST /api/v1/auth/password-reset': { status: 202, body: { status: 'accepted' } } },
  });
  await screen.findByRole('heading', { name: 'Reset your password' });
  await press('Email me a link');
  expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();
  await type('Email', 'alice@example.com');
  await press('Email me a link');
  expect(await screen.findByText(/we sent it a link/)).toBeOnTheScreen();
  expect(server.last().body).toEqual({ email: 'alice@example.com' });
});

describe('verify email', () => {
  test('confirms the address once and signs in', async () => {
    const { server, app } = await renderApp(`/verify-email?token=${LINK_TOKEN}`, {
      routes: {
        'POST /api/v1/auth/verify-email': { status: 200, body: { user: ME, token: 'fresh' } },
      },
    });
    expect(await screen.findByText('Signed in as alice.')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    const verifications = server.requests.filter((r) => r.path === '/api/v1/auth/verify-email');
    expect(verifications).toEqual([
      expect.objectContaining({ body: { token: LINK_TOKEN, transport: 'bearer' } }),
    ]);
    expect(savedToken()).toBe('fresh');
  });

  test('a malformed link is refused without asking the server', async () => {
    const { server } = await renderApp('/verify-email?token=short');
    expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(server.requests).toHaveLength(0);
  });

  test('an expired link says so', async () => {
    await renderApp(`/verify-email?token=${LINK_TOKEN}`, {
      routes: {
        'POST /api/v1/auth/verify-email': error(
          400,
          'invalid_token',
          'This link is invalid or has expired.',
        ),
      },
    });
    expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(screen.getByText('Sign up again')).toBeOnTheScreen();
  });
});

describe('reset password', () => {
  test('a malformed link is refused', async () => {
    await renderApp('/reset-password');
    expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(screen.getByText('Request a new link')).toBeOnTheScreen();
  });

  test('checks the passwords match', async () => {
    const { server } = await renderApp(`/reset-password?token=${LINK_TOKEN}`);
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await type('New password', 'correct horse');
    await type('Repeat the new password', 'correct horsf');
    await press('Change password');
    expect(screen.getByText('The passwords do not match.')).toBeOnTheScreen();
    expect(server.requests).toHaveLength(0);
  });

  test('shows a weak password on its field, with a way to get a new link', async () => {
    await renderApp(`/reset-password?token=${LINK_TOKEN}`, {
      routes: {
        'POST /api/v1/auth/password-reset/confirm': error(
          422,
          'weak_password',
          'Your password must not be your username.',
        ),
      },
    });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await type('New password', 'alicealice');
    await type('Repeat the new password', 'alicealice');
    await press('Change password');
    expect(await screen.findByText('Your password must not be your username.')).toBeOnTheScreen();
    expect(screen.getByText('Request a new link')).toBeOnTheScreen();
  });

  test('changes the password and signs this device out', async () => {
    const { server } = await renderApp(`/reset-password?token=${LINK_TOKEN}`, {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'POST /api/v1/auth/password-reset/confirm': { status: 204 },
      },
    });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await type('New password', 'correct horse');
    await type('Repeat the new password', 'correct horse');
    await press('Change password');
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeOnTheScreen();
    expect(server.last().body).toEqual({ token: LINK_TOKEN, password: 'correct horse' });
    await waitFor(() => expect(savedToken()).toBeNull());
  });

  test('a signed-out visitor can change the password too', async () => {
    await renderApp(`/reset-password?token=${LINK_TOKEN}`, {
      routes: { 'POST /api/v1/auth/password-reset/confirm': { status: 204 } },
    });
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await type('New password', 'correct horse');
    await type('Repeat the new password', 'correct horse');
    await press('Change password');
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeOnTheScreen();
  });
});

test('an unreachable server can be retried', async () => {
  const { server } = await renderApp('/', {
    token: 'tok',
    routes: { 'GET /api/v1/me': error(503, 'unavailable', 'Down.') },
  });
  expect(await screen.findByText('Down.')).toBeOnTheScreen();
  server.on('GET /api/v1/me', { status: 200, body: ME });
  await press('Try again');
  expect(await screen.findByText('Signed in as alice.')).toBeOnTheScreen();
});

test('signing in opens the live connection; signing out closes it', async () => {
  await renderApp('/', {
    token: 'tok',
    routes: { ...SIGNED_IN, 'POST /api/v1/auth/logout': { status: 204 } },
  });
  await screen.findByText('Signed in as alice.');
  expect(FakeSocket.all).toHaveLength(1);
  expect(FakeSocket.latest().url).toBe('ws://localhost:8000/api/v1/ws');
  await press('Sign out');
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(FakeSocket.latest().closed).toBe(true);
});
