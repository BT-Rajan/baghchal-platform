import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
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
  test('make one from Play now, share it, cancel it', async () => {
    const mine = link({ challenger: ALICE, side: 'goat', time_control: '10+5' });
    const { app, server } = await open('/play', {
      'GET /api/v1/seeks/counts': { status: 200, body: [] },
      'POST /api/v1/challenges': { status: 201, body: mine },
      'POST /api/v1/challenges/c1/cancel': {
        status: 200,
        body: { ...mine, status: 'cancelled' },
      },
    });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Challenge a friend by link' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Challenge a friend by link' }),
    ).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/invite');
    // Challenges by link are casual: there is no rated choice.
    expect(screen.queryByRole('radio', { name: 'Rated' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: '10+5' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Goats' }));
    await press('Make a link');

    expect(await screen.findByText('Your challenge by link')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/challenges').body).toEqual({
      time_control: '10+5',
      rated: false,
      side: 'goat',
    });
    expect(screen.getByText('10+5 · casual · you play goats')).toBeOnTheScreen();
    expect(screen.getByLabelText('Link to share')).toHaveTextContent('/c/abc123');
    expect(screen.getByText(/^Expires in (23 h 59 min|24 h)$/)).toBeOnTheScreen();
    await press('Cancel the challenge by link');
    await waitFor(() => expect(app.getPathname()).toBe('/play'));
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
    await press('Accept and play');
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
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept and play' }));
    expect(
      await screen.findByText('This challenge is closed. Ask your friend for a new link.'),
    ).toBeOnTheScreen();
  });

  test('my own link can be shared or cancelled from its page', async () => {
    let cancelled = false;
    const mine = link({ challenger: ALICE });
    await open('/c/abc123', {
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
    await press('Cancel the challenge by link');
    expect(
      await screen.findByText('This challenge is closed. Ask your friend for a new link.'),
    ).toBeOnTheScreen();
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
    await open('/c/nope', {
      'GET /api/v1/challenges/link/nope': error(
        404,
        'challenge_not_found',
        'No such challenge. Ask your friend for a new link.',
      ),
    });
    expect(
      await screen.findByText('No such challenge. Ask your friend for a new link.'),
    ).toBeOnTheScreen();
  });
});
