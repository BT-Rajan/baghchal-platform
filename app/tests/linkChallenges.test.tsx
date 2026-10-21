import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Share } from 'react-native';

import { renderApp } from './support/app';
import { AGREED, ME, error, type Route } from './support/fakeServer';
import { BOB, challenge, game } from './support/games';

const ALICE = { id: ME.id, username: ME.username };
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const DAY = 86_400;
const URL = '/api/v1/challenges/link/abc123';

/** A challenge by link, made just now, open for a day. */
const link = (overrides: Parameters<typeof challenge>[0] = {}) =>
  challenge({
    challenger: BOB,
    opponent: null,
    code: 'abc123',
    side: 'goat',
    created_at: inSeconds(0),
    expires_at: inSeconds(DAY),
    ...overrides,
  });

function open(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: ME }, ...routes },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

const STARTED = { status: 200, body: game({ server_time: new Date().toISOString() }) };

describe('challenges by link', () => {
  test('make one from home, share it, cancel it', async () => {
    const mine = link({ challenger: ALICE, side: 'goat', time_control: '2+1' });
    const { app, server } = await open('/', {
      'POST /api/v1/challenges': { status: 201, body: mine },
      'POST /api/v1/challenges/c1/cancel': {
        status: 200,
        body: { ...mine, status: 'cancelled' },
      },
    });
    await fireEvent.press(await screen.findByRole('link', { name: 'Challenge a friend by link' }));
    expect(
      await screen.findByRole('heading', { name: 'Challenge a friend by link' }),
    ).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/invite');
    // Challenges by link are casual: there is no rated choice.
    expect(screen.queryByRole('radio', { name: 'Rated' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: '2+1' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Goats' }));
    await press('Make a link');

    expect(await screen.findByText('Your challenge by link')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/challenges').body).toEqual({
      time_control: '2+1',
      rated: false,
      side: 'goat',
    });
    expect(screen.getByText('2+1 · casual · you play goats')).toBeOnTheScreen();
    // The website's full address, to copy, or to send with the phone's share sheet.
    expect(screen.getByLabelText('Link to share')).toHaveTextContent(
      'http://localhost:8000/c/abc123',
    );
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await press('Share the link');
    expect(share).toHaveBeenCalledWith({ url: 'http://localhost:8000/c/abc123' });
    share.mockRestore();
    expect(screen.getByText(/^Expires in (23 h 59 min|24 h)$/)).toBeOnTheScreen();
    await press('Cancel the challenge by link');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(server.lastTo('POST /api/v1/challenges/c1/cancel')).toBeDefined();
  });

  test('Done leaves the link open; a refusal is shown', async () => {
    let refuse = true;
    const { app } = await open('/invite', {
      'POST /api/v1/challenges': () =>
        refuse
          ? error(429, 'too_many_challenges', 'Cancel one first.')
          : { status: 201, body: link({ challenger: ALICE }) },
    });
    await screen.findByRole('heading', { name: 'Challenge a friend by link' });
    await press('Make a link');
    expect(await screen.findByText('Cancel one first.')).toBeOnTheScreen();
    refuse = false;
    await press('Make a link');
    await fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  test('a friend opens the link and plays', async () => {
    const { app } = await open('/c/abc123', {
      [`GET ${URL}`]: { status: 200, body: link() },
      [`POST ${URL}/accept`]: {
        status: 200,
        body: link({ opponent: ALICE, status: 'accepted', game_id: 'g1' }),
      },
      'GET /api/v1/games/g1': STARTED,
    });
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(screen.getByText('5+3 · casual · you play tigers')).toBeOnTheScreen();
    // The lobby's card: nothing to decline (whoever does not want it leaves it), nor to share.
    expect(screen.queryByRole('button', { name: "Decline bob's challenge" })).toBeNull();
    expect(screen.queryByLabelText('Link to share')).toBeNull();
    await press("Accept bob's challenge");
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
  });

  test('a refusal to accept is shown, with the challenge as it is now', async () => {
    let gone = false;
    await open('/c/abc123', {
      [`GET ${URL}`]: () => ({
        status: 200,
        body: gone ? link({ status: 'accepted', opponent: { id: 'x', username: 'zed' } }) : link(),
      }),
      [`POST ${URL}/accept`]: () => {
        gone = true;
        return error(409, 'challenge_closed', 'Someone else accepted first.');
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: "Accept bob's challenge" }));
    expect(
      await screen.findByText('This challenge is closed. Ask your friend for a new link.'),
    ).toBeOnTheScreen();
  });

  test('my own link can be shared or cancelled from its page', async () => {
    let cancelled = false;
    const mine = link({ challenger: ALICE });
    const { app } = await open('/c/abc123', {
      [`GET ${URL}`]: () => ({
        status: 200,
        body: cancelled ? { ...mine, status: 'cancelled' } : mine,
      }),
      'POST /api/v1/challenges/c1/cancel': () => {
        cancelled = true;
        return { status: 200, body: { ...mine, status: 'cancelled' } };
      },
    });
    expect(await screen.findByText('Your challenge by link')).toBeOnTheScreen();
    expect(screen.getByText('If you cancel, the link stops working.')).toBeOnTheScreen();
    await press('Cancel the challenge by link');
    expect(
      await screen.findByText('This challenge is closed. Ask your friend for a new link.'),
    ).toBeOnTheScreen();
    // Nothing more to do here: back to Play.
    await press('Go to Play');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  test('once accepted, both players can go to the game', async () => {
    const { app } = await open('/c/abc123', {
      [`GET ${URL}`]: {
        status: 200,
        body: link({ challenger: ALICE, opponent: BOB, status: 'accepted', game_id: 'g1' }),
      },
      'GET /api/v1/games/g1': STARTED,
    });
    expect(await screen.findByText('The challenge was accepted.')).toBeOnTheScreen();
    await press('Go to the game');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
  });

  test('an unknown link', async () => {
    const { app } = await open('/c/nope', {
      'GET /api/v1/challenges/link/nope': error(
        404,
        'challenge_not_found',
        'No such challenge. Ask your friend for a new link.',
      ),
    });
    expect(
      await screen.findByText("This link doesn't work. Ask your friend for a new one."),
    ).toBeOnTheScreen();
    await press('Go to Play');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });
});

describe('a signed-out friend opens a challenge link', () => {
  const GUEST = {
    ...ME,
    username: 'guest-3fa9c1',
    email: 'guest-3fa9c1@guest.invalid',
    role: 'guest' as const,
  };
  const LINK_ROUTES: Record<string, Route> = {
    [`GET ${URL}`]: { status: 200, body: link() },
  };

  async function arrive(routes: Record<string, Route> = {}) {
    const rendered = await renderApp('/c/abc123', { routes: { ...LINK_ROUTES, ...routes } });
    await waitFor(() => expect(rendered.app.getPathname()).toBe('/welcome'));
    expect(
      screen.getByText(
        'Play now as a guest, or sign in, and we will take you to the link you opened.',
      ),
    ).toBeOnTheScreen();
    return rendered;
  }

  test('plays as a guest and goes straight to the challenge, not the computer', async () => {
    const { app, server } = await arrive({
      'POST /api/v1/auth/guest': { status: 200, body: { user: GUEST, token: 'guest-tok' } },
    });
    await press('Play now, no sign-up');
    await screen.findByRole('button', { name: 'Accept and play', busy: false });
    // Not the first game against the computer: that line is not shown.
    expect(screen.queryByText(/^You'll play the goats/)).toBeNull();
    await press('Accept and play');
    await waitFor(() => expect(app.getPathname()).toBe('/c/abc123'));
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/guest').body).toEqual({
      ...AGREED,
      transport: 'bearer',
    });
    expect(server.requests.filter((r) => r.path === '/api/v1/games/computer')).toHaveLength(0);
  });

  test('signs in and goes on to the challenge', async () => {
    const { app } = await arrive({
      'POST /api/v1/auth/login': { status: 200, body: { user: ME, token: 'tok' } },
    });
    await press('Sign in');
    await fireEvent.changeText(await screen.findByLabelText('Username or email'), 'alice');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
    await press('Sign in');
    await waitFor(() => expect(app.getPathname()).toBe('/c/abc123'));
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
  });

  test('makes an account, confirms the email, and goes on to the challenge', async () => {
    const { app } = await arrive({
      'POST /api/v1/auth/verify-email': { status: 200, body: { user: ME, token: 'fresh' } },
    });
    // The link in the confirmation email.
    await act(() => router.push(`/verify-email?token=${'a'.repeat(43)}`));
    await waitFor(() => expect(app.getPathname()).toBe('/c/abc123'));
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
  });

  test('without a link, a new account goes to make it theirs', async () => {
    const { app } = await renderApp('/welcome', {
      routes: {
        'POST /api/v1/auth/verify-email': { status: 200, body: { user: ME, token: 'fresh' } },
      },
    });
    expect(
      screen.queryByText(
        'Play now as a guest, or sign in, and we will take you to the link you opened.',
      ),
    ).toBeNull();
    await act(() => router.push(`/verify-email?token=${'a'.repeat(43)}`));
    await waitFor(() => expect(app.getPathname()).toBe('/make-it-yours'));
  });
});
