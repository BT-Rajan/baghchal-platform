import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, challenge } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const BOB_PLAYER = { ...BOB, online: true, playing: false };
const profile = (blocked: boolean) => ({
  status: 200,
  body: { ...BOB_PLAYER, blocked, created_at: '2026-03-02T10:00:00Z', ratings: {} },
});
const MY_PROFILE = {
  status: 200,
  body: { ...ME, online: true, playing: false, blocked: false, ratings: {} },
};

function signedIn(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

describe("blocking from a player's page", () => {
  test('asks first, then blocks; the challenge button goes away until unblocked', async () => {
    const { server } = await signedIn('/player/bob', { 'GET /api/v1/players/bob': profile(false) });
    await screen.findByRole('button', { name: 'Block bob' });
    await press('Block bob');
    expect(screen.getByText(/^Block bob\? Neither of you/)).toBeOnTheScreen();
    await press('Cancel');
    expect(screen.queryByText(/^Block bob\?/)).toBeNull();

    server.on('PUT /api/v1/blocks/bob', { status: 204 });
    await press('Block bob');
    server.on('GET /api/v1/players/bob', profile(true));
    await press('Yes, block bob');
    expect(await screen.findByText(/^You have blocked bob\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Challenge bob' })).toBeNull();
    expect(server.lastTo('PUT /api/v1/blocks/bob')).toBeDefined();

    server.on('DELETE /api/v1/blocks/bob', { status: 204 });
    server.on('GET /api/v1/players/bob', profile(false));
    await press('Unblock bob');
    expect(await screen.findByRole('button', { name: 'Challenge bob' })).toBeOnTheScreen();
    expect(server.lastTo('DELETE /api/v1/blocks/bob')).toBeDefined();
  });

  test('a failed block is reported', async () => {
    await signedIn('/player/bob', {
      'GET /api/v1/players/bob': profile(false),
      'PUT /api/v1/blocks/bob': error(429, 'rate_limited', 'Too many requests.'),
    });
    await screen.findByRole('button', { name: 'Block bob' });
    await press('Block bob');
    await press('Yes, block bob');
    expect(await screen.findByText('Too many requests.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Yes, block bob' })).toBeOnTheScreen();
  });
});

describe('the list of blocked players', () => {
  test('lists them and unblocks', async () => {
    const { server } = await signedIn('/me', {
      'GET /api/v1/players/alice': MY_PROFILE,
      'GET /api/v1/blocks': { status: 200, body: [BOB_PLAYER] },
      'DELETE /api/v1/blocks/bob': () => {
        server.on('GET /api/v1/blocks', { status: 200, body: [] });
        return { status: 204 };
      },
    });
    expect(await screen.findByText('bob')).toBeOnTheScreen();
    await press('Unblock bob');
    expect(await screen.findByText('You have not blocked anyone.')).toBeOnTheScreen();
  });

  test('a failed unblock and a failed list are reported', async () => {
    const { server } = await signedIn('/me', {
      'GET /api/v1/players/alice': MY_PROFILE,
      'GET /api/v1/blocks': error(400, 'bad_request', 'The list is down.'),
    });
    expect(await screen.findByText('The list is down.')).toBeOnTheScreen();
    server.on('GET /api/v1/blocks', { status: 200, body: [BOB_PLAYER] });
    server.on('DELETE /api/v1/blocks/bob', error(503, 'unavailable', 'Try again later.'));
    await press('Try again');
    await screen.findByText('bob');
    await press('Unblock bob');
    expect(await screen.findByText('Try again later.')).toBeOnTheScreen();
  });
});

describe('fair-play refusals are explained', () => {
  test('accepting while in the abort cooldown', async () => {
    const message =
      'You have aborted 3 games in the last 24 hours (not making a first move counts too). ' +
      'You can start new games again in 42 minutes.';
    const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
    await signedIn('/leaderboard', {
      'GET /api/v1/leaderboards/blitz': { status: 200, body: [] },
      'GET /api/v1/challenges': {
        status: 200,
        body: {
          incoming: [challenge({ created_at: inSeconds(0), expires_at: inSeconds(40) })],
          outgoing: [],
        },
      },
      'POST /api/v1/challenges/c1/accept': error(429, 'abort_cooldown', message),
    });
    await screen.findByText(/^bob challenges you/);
    await press("Accept bob's challenge");
    expect(await screen.findByText(message)).toBeOnTheScreen();
  });

  test('challenging someone who blocked you', async () => {
    const { server } = await signedIn('/challenge/bob', {
      'GET /api/v1/players/bob': profile(false),
      'POST /api/v1/challenges': error(403, 'challenge_refused', 'You cannot challenge bob.'),
    });
    await screen.findByRole('button', { name: 'Send challenge' });
    await press('Send challenge');
    expect(await screen.findByText('You cannot challenge bob.')).toBeOnTheScreen();
    await waitFor(() => expect(server.lastTo('POST /api/v1/challenges')).toBeDefined());
  });
});
