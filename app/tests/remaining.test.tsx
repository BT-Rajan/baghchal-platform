import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, challenge, game } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const ALICE = { id: ME.id, username: ME.username };
const CAROL = { id: '00000000-0000-4000-8000-000000000003', username: 'carol' };
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const fresh = (s: number) => ({ created_at: inSeconds(0), expires_at: inSeconds(s) });
const now = () => new Date().toISOString();

function signedIn(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

const LEADERBOARD = { 'GET /api/v1/leaderboards/blitz': { status: 200, body: [] } };

describe('the challenge banner', () => {
  test('shows a challenge on other screens, and accepting opens the game', async () => {
    const c = challenge({ ...fresh(40) });
    const { app } = await signedIn('/leaderboard', {
      ...LEADERBOARD,
      'GET /api/v1/challenges': { status: 200, body: { incoming: [c], outgoing: [] } },
      'POST /api/v1/challenges/c1/accept': {
        status: 200,
        body: { ...c, status: 'accepted', game_id: 'g1' },
      },
      'GET /api/v1/games/g1': { status: 200, body: game({ server_time: now() }) },
    });
    // The lobby's own card, on the leaderboard.
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(screen.getByText('5+3 · casual · random sides')).toBeOnTheScreen();
    expect(screen.getByText(/^Expires in \d+ s$/)).toBeOnTheScreen();
    await press("Accept bob's challenge");
    expect(await screen.findByText('alice (you)')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/game/g1');
  });

  test('says how many more are waiting, and can decline', async () => {
    const first = challenge({ ...fresh(40) });
    const second = challenge({ id: 'c2', challenger: CAROL, ...fresh(50) });
    await signedIn('/leaderboard', {
      ...LEADERBOARD,
      'GET /api/v1/challenges': {
        status: 200,
        body: { incoming: [first, second], outgoing: [] },
      },
      'POST /api/v1/challenges/c1/decline': {
        status: 200,
        body: { ...first, status: 'declined' },
      },
    });
    expect(await screen.findByText('And 1 more challenge on Play.')).toBeOnTheScreen();
    await press("Decline bob's challenge");
    expect(await screen.findByText(/^carol challenges you/)).toBeOnTheScreen();
  });

  test('shows why an answer failed', async () => {
    await signedIn('/leaderboard', {
      ...LEADERBOARD,
      'GET /api/v1/challenges': {
        status: 200,
        body: { incoming: [challenge({ ...fresh(40) })], outgoing: [] },
      },
      'POST /api/v1/challenges/c1/accept': error(
        409,
        'player_busy',
        'One of you is already playing a game.',
      ),
    });
    await screen.findByText(/^bob challenges you/);
    await press("Accept bob's challenge");
    expect(await screen.findByText('One of you is already playing a game.')).toBeOnTheScreen();
  });

  test('is not shown in the lobby, which lists challenges itself', async () => {
    await signedIn('/', {
      'GET /api/v1/challenges': {
        status: 200,
        body: { incoming: [challenge({ ...fresh(40) })], outgoing: [] },
      },
    });
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(screen.getAllByText('bob challenges you')).toHaveLength(1);
  });

  test('is not shown during a game of my own', async () => {
    const live = game({ ply: 4, server_time: now() });
    await signedIn('/game/g1', {
      'GET /api/v1/games': { status: 200, body: [live] },
      'GET /api/v1/games/g1': { status: 200, body: live },
      'GET /api/v1/challenges': {
        status: 200,
        body: { incoming: [challenge({ challenger: CAROL, ...fresh(40) })], outgoing: [] },
      },
    });
    await screen.findByText('Your move');
    await waitFor(() => expect(screen.queryByText(/^carol challenges you/)).toBeNull());
  });
});

describe('rematch', () => {
  const over = () =>
    game({
      status: 'finished',
      result: { winner: 'tiger', reason: 'five_captured' },
      legal_moves: [],
      server_time: now(),
    });

  test('challenges the same player, casual, sides swapped', async () => {
    const { server, app } = await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: over() },
      'POST /api/v1/challenges': {
        status: 201,
        body: challenge({ challenger: ALICE, opponent: BOB, side: 'tiger', ...fresh(60) }),
      },
    });
    await screen.findByText('You lost: the tigers captured five goats.');
    await press('Rematch bob');
    // The answer comes here, so the chat after the game stays open.
    expect(await screen.findByText('Rematch sent. Waiting for bob…')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/game/g1');
    expect(server.lastTo('POST /api/v1/challenges').body).toEqual({
      opponent: 'bob',
      time_control: '5+3',
      rated: false,
      side: 'tiger',
    });
  });

  test('says when the other player got there first', async () => {
    await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: over() },
      'POST /api/v1/challenges': error(
        409,
        'challenge_incoming',
        'bob has already challenged you. Accept their challenge instead.',
      ),
    });
    await screen.findByText('You lost: the tigers captured five goats.');
    await press('Rematch bob');
    expect(
      await screen.findByText('bob has already challenged you. Accept their challenge instead.'),
    ).toBeOnTheScreen();
  });

  test('is not offered to someone watching', async () => {
    await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: { ...over(), goat: CAROL } },
    });
    await screen.findByText(/won/);
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull();
  });

  test('is not offered for a time control the lobby does not know', async () => {
    await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: { ...over(), time_control: '1+0' } },
    });
    await screen.findByText('You lost: the tigers captured five goats.');
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull();
  });
});

test('someone watching a game sees it move on without live events', async () => {
  let served = game({ goat: BOB, tiger: CAROL, ply: 4, side_to_move: 'goat', server_time: now() });
  const { server } = await signedIn('/game/g1', {
    'GET /api/v1/games/g1': () => ({ status: 200, body: served }),
  });
  expect(await screen.findByText('bob to move')).toBeOnTheScreen();
  served = game({ goat: BOB, tiger: CAROL, ply: 5, side_to_move: 'tiger', server_time: now() });
  expect(await screen.findByText('carol to move', {}, { timeout: 6_000 })).toBeOnTheScreen();
  const fetches = server.requests.filter((r) => r.path === '/api/v1/games/g1').length;
  expect(fetches).toBeGreaterThan(1);
});
