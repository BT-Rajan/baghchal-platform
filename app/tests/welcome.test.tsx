import { router } from 'expo-router';
import { render } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Welcome from '@/app/welcome';

import { renderApp, savedToken } from './support/app';
import { AGREED, ME, error, type Route } from './support/fakeServer';
import { game } from './support/games';

const GUEST = {
  ...ME,
  username: 'guest-3fa9c1',
  email: 'guest-3fa9c1@guest.invalid',
  role: 'guest' as const,
};

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

describe('the apps’ start screen', () => {
  test('says what ClawPlay is, and starts a first game as a guest', async () => {
    const first = game({
      goat: { id: GUEST.id, username: GUEST.username },
      tiger: { id: 'cpu', username: 'computer-easy' },
      computer: 'easy',
      time_control: '15+10',
      server_time: new Date().toISOString(),
    });
    const { server, app } = await renderApp('/', {
      routes: {
        'POST /api/v1/auth/guest': { status: 200, body: { user: GUEST, token: 'guest-tok' } },
        'GET /api/v1/me': { status: 200, body: GUEST },
        'POST /api/v1/games/computer': { status: 201, body: first },
        'GET /api/v1/games/g1': { status: 200, body: first },
      },
    });
    expect(await screen.findByText(/^Tigers hunt\./)).toBeOnTheScreen();
    // An app's start screen, not the web's landing page.
    expect(screen.queryByText('Play your way')).toBeNull();
    await press('Play now, no sign-up');
    await screen.findByRole('heading', { name: 'Your first game' });
    await fireEvent.changeText(screen.getByLabelText('Month of birth'), '01');
    await fireEvent.changeText(screen.getByLabelText('Year of birth'), '1990');
    await press('Start playing');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
    expect(server.lastTo('POST /api/v1/auth/guest').body).toEqual({
      ...AGREED,
      transport: 'bearer',
    });
    expect(savedToken()).toBe('guest-tok');
    // The Easy computer, with the goats, who move first: the coach says what to do.
    expect(server.lastTo('POST /api/v1/games/computer').body).toEqual({
      level: 'easy',
      side: 'goat',
      time_control: '15+10',
    });
    expect(await screen.findByText('Place a goat')).toBeOnTheScreen();
  });

  test('a young guest plays the computer only, and a refusal is shown', async () => {
    const { server } = await renderApp('/start', {
      routes: { 'POST /api/v1/auth/guest': error(429, 'rate_limited', 'Slow down.') },
    });
    await screen.findByRole('button', { name: 'Start playing', busy: false });
    await press('Start playing');
    expect(screen.getByText('Enter the month and year you were born.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Month of birth'), '5');
    await fireEvent.changeText(
      screen.getByLabelText('Year of birth'),
      String(new Date().getFullYear() - 10),
    );
    await press('Start playing');
    expect(screen.getByText('You must be at least 13 to play on ClawPlay.')).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText('Year of birth'),
      String(new Date().getFullYear() - 15),
    );
    // A young guest may play the computer; no parent is asked until they make an account.
    expect(screen.getByText(/^Under 18, you can play the computer as a guest/)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Parent's or guardian's email")).toBeNull();
    await press('Start playing');
    expect(await screen.findByText('Slow down.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/guest').body).not.toHaveProperty('parent_email');
  });

  test('leads to sign in and sign up', async () => {
    const { app } = await renderApp('/welcome');
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
    await renderApp('/welcome').then(async ({ app: again }) => {
      await fireEvent.press(await screen.findByRole('button', { name: 'Create a free account' }));
      await waitFor(() => expect(again.getPathname()).toBe('/sign-up'));
    });
  });
});

describe('a guest', () => {
  function asGuest(url: string, routes: Record<string, Route> = {}) {
    return renderApp(url, {
      token: 'guest-tok',
      routes: { 'GET /api/v1/me': { status: 200, body: GUEST }, ...routes },
    });
  }

  test('is offered an account in the lobby', async () => {
    const { app } = await asGuest('/');
    expect(
      await screen.findByText(/^You are playing as guest-3fa9c1\. Make a free account/),
    ).toBeOnTheScreen();
    await press('Make a free account');
    await waitFor(() => expect(app.getPathname()).toBe('/claim'));
  });

  test('makes an account and keeps playing', async () => {
    let me: typeof GUEST | typeof ME = GUEST;
    const { server, app } = await asGuest('/claim', {
      'GET /api/v1/me': () => ({ status: 200, body: me }),
      'POST /api/v1/me/claim': () => {
        me = { ...ME, username: 'Sita' };
        return { status: 200, body: me };
      },
    });
    await screen.findByRole('heading', { name: 'Make your free account' });
    await fireEvent.changeText(screen.getByLabelText('Username'), 'Sita');
    await fireEvent.changeText(screen.getByLabelText('Email'), ' sita@example.com ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent.changeText(screen.getByLabelText('Month of birth'), '1');
    await fireEvent.changeText(screen.getByLabelText('Year of birth'), '1990');
    await press('Make my account');
    expect(await screen.findByRole('heading', { name: 'Welcome, Sita!' })).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/claim').body).toEqual({
      ...AGREED,
      username: 'Sita',
      email: 'sita@example.com',
      password: 'correct horse',
    });
    await press('Back to playing');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.queryByText(/^You are playing as/)).toBeNull();
  });

  test('sees why a claim fails, by the field', async () => {
    await asGuest('/claim', {
      'POST /api/v1/me/claim': error(409, 'username_taken', 'That username is taken.'),
    });
    await screen.findByRole('button', { name: 'Make my account', busy: false });
    await press('Make my account');
    expect(screen.getByText('Choose a username.', { exact: false })).toBeDefined();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'bob');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'b@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent.changeText(screen.getByLabelText('Month of birth'), '1');
    await fireEvent.changeText(screen.getByLabelText('Year of birth'), '1990');
    await press('Make my account');
    expect(await screen.findByText('That username is taken.')).toBeOnTheScreen();
  });

  test('has no account settings, and is warned before signing out', async () => {
    await asGuest('/settings', {
      'GET /api/v1/players/guest-3fa9c1': {
        status: 200,
        body: { ...GUEST, online: true, playing: false, blocked: false, ratings: {} },
      },
      'GET /api/v1/players/guest-3fa9c1/games': { status: 200, body: [] },
      'GET /api/v1/blocks': { status: 200, body: [] },
    });
    expect(
      await screen.findByRole('button', { name: 'Sign out (this guest account will be lost)' }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/guest-3fa9c1@guest\.invalid/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Email address' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Moderation' })).toBeNull();
  });
});

const METRICS = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('the web’s landing page', () => {
  test('says what ClawPlay is, with buttons to play and links onward', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const push = jest.spyOn(router, 'push').mockImplementation(() => {});
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Welcome />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Play your way')).toBeOnTheScreen();
    expect(screen.getByText('Goats trap')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start playing' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Create a free account' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    expect(push.mock.calls).toEqual([['/start'], ['/sign-up'], ['/privacy']]);
  });
});
