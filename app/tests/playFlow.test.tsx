import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, challenge, game } from './support/games';

import { openedFromScreen, showingGame } from '@/game/onScreen';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const GUEST = { 'GET /api/v1/me': { status: 200, body: { ...ME, role: 'guest' } } };
const now = () => new Date().toISOString();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const ALICE = { id: ME.id, username: 'alice' };

function open(url: string, routes: Record<string, Route> = {}, me: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...me, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

afterEach(() => jest.restoreAllMocks());

describe('game 2 of a rated match', () => {
  const score = [
    { player: ALICE, points: 1 },
    { player: BOB, points: 0 },
  ];
  const first = (startsAt: string | null) =>
    game({
      id: 'g1',
      rated: true,
      status: 'finished',
      result: { winner: 'goat', reason: 'tigers_trapped' },
      legal_moves: [],
      match: { id: 'm1', game: 1, games: ['g1', 'g2'], score, game_2_starts_at: startsAt },
      server_time: now(),
    });
  const second = game({
    id: 'g2',
    goat: BOB,
    tiger: ALICE,
    rated: true,
    match: { id: 'm1', game: 2, games: ['g1', 'g2'], score },
    server_time: now(),
  });

  test('game 1’s result stays while game 2 counts down; it can start sooner', async () => {
    const { app } = await open('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: first(inSeconds(10)) },
      'GET /api/v1/games/g2': { status: 200, body: second },
    });
    expect(await screen.findByText('You won: the tigers could not move.')).toBeOnTheScreen();
    expect(await screen.findByText(/^Game 2 starts in \d+ seconds…$/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull(); // game 2 follows
    await press('Play game 2 now');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g2'));
  });

  test('when the countdown ends, game 2 opens by itself', async () => {
    const { app } = await open('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: first(inSeconds(2)) },
      'GET /api/v1/games/g2': { status: 200, body: second },
    });
    expect(await screen.findByText(/^Game 2 starts in \d seconds?…$/)).toBeOnTheScreen();
    await waitFor(() => expect(app.getPathname()).toBe('/game/g2'), { timeout: 8000 });
  });

  test('the screen in front decides whether a started game opens for me', () => {
    const match = (n: number) => ({ game: n, games: ['g1', 'g2'] });
    const hide = showingGame('g1');
    expect(openedFromScreen({ match: match(2) })).toBe(true); // game 1 leads on to it
    expect(openedFromScreen({ match: match(1) })).toBe(false);
    expect(openedFromScreen({ match: null })).toBe(false);
    hide();
    expect(openedFromScreen({ match: match(2) })).toBe(false);
    const other = showingGame('g9');
    hide(); // an old screen's goodbye does not hide the one in front now
    expect(openedFromScreen({ match: { game: 2, games: ['g9', 'g10'] } })).toBe(true);
    other();
  });
});

describe('after a game', () => {
  const over = (overrides = {}) =>
    game({
      status: 'finished',
      result: { winner: 'tiger', reason: 'five_captured' },
      legal_moves: [],
      server_time: now(),
      ...overrides,
    });

  test('a tournament game leads back to its tournament, not to a rematch', async () => {
    const { app } = await open('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: over({ tournament: 'cup1' }) },
      'GET /api/v1/tournaments/cup1': error(404, 'tournament_not_found', 'No such tournament.'),
    });
    await screen.findByRole('button', { name: 'Back to the tournament' });
    await press('Back to the tournament');
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull();
    await waitFor(() => expect(app.getPathname()).toBe('/tournament/cup1'));
  });

  test('guests are not offered a rematch they cannot send', async () => {
    await open('/game/g1', { 'GET /api/v1/games/g1': { status: 200, body: over() } }, GUEST);
    expect(await screen.findByText('You lost: the tigers captured five goats.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull();
  });

  test('a declined rematch is said on the game screen', async () => {
    const sent = challenge({
      id: 'c7',
      challenger: ALICE,
      opponent: BOB,
      expires_at: inSeconds(60),
    });
    const { server } = await open('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: over() },
      'POST /api/v1/challenges': { status: 201, body: sent },
    });
    await screen.findByText('You lost: the tigers captured five goats.');
    await press('Rematch bob');
    expect(await screen.findByText('Rematch sent. Waiting for bob to answer…')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/challenges')).toBeDefined();
  });
});

describe('the Play screen', () => {
  test('guests are not offered rated games', async () => {
    await open('/play', { 'GET /api/v1/seeks': { status: 200, body: [] } }, GUEST);
    await screen.findByRole('button', { name: 'Find an opponent' });
    expect(screen.queryByRole('radio', { name: 'Rated' })).toBeNull();
  });

  test('the leaderboard’s “Play a rated game” opens it with rated chosen', async () => {
    await open('/play?mode=rated', { 'GET /api/v1/seeks': { status: 200, body: [] } });
    expect(await screen.findByRole('radio', { name: 'Rated' })).toBeChecked();
  });

  test('putting the app away stops looking for a game', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.push(handler as (state: AppStateStatus) => void);
      return { remove: () => {} };
    });
    const { server } = await open('/play', {
      'GET /api/v1/seeks': { status: 200, body: [] },
      'POST /api/v1/seeks': {
        status: 200,
        body: { status: 'waiting', game: null, expires_at: inSeconds(120) },
      },
      'DELETE /api/v1/seeks': { status: 204 },
    });
    await screen.findByRole('button', { name: 'Find an opponent' });
    await press('Find an opponent');
    await screen.findByRole('button', { name: 'Stop looking' });
    await act(async () => listeners.forEach((l) => l('background')));
    await waitFor(() =>
      expect(server.requests.some((r) => r.method === 'DELETE' && r.path === '/api/v1/seeks')).toBe(
        true,
      ),
    );
    expect(await screen.findByRole('button', { name: 'Find an opponent' })).toBeOnTheScreen();
  });

  test('a refusal comes with its next step', async () => {
    let rated: unknown = null;
    const { server } = await open('/play?mode=rated', {
      'GET /api/v1/seeks': { status: 200, body: [] },
      'POST /api/v1/seeks': (request) => {
        rated = (request.body as { rated: boolean }).rated;
        return rated
          ? error(429, 'rated_match_limit', 'You have already played a rated match.')
          : { status: 200, body: { status: 'waiting', game: null, expires_at: inSeconds(120) } };
      },
    });
    await screen.findByRole('button', { name: 'Find an opponent' });
    await press('Find an opponent');
    await screen.findByRole('button', { name: 'Play casual instead' });
    await press('Play casual instead');
    await screen.findByRole('button', { name: 'Stop looking' });
    expect(rated).toBe(false);
    expect(screen.getByRole('radio', { name: 'Casual' })).toBeChecked();
    expect(server.requests.filter((r) => r.method === 'POST').length).toBeGreaterThan(1);
  });
});

describe('errors with a way forward', () => {
  test.each([
    ['player_busy', 'Go to my game', '/game/g5'],
    ['abort_cooldown', 'Play the computer meanwhile', '/play'],
    ['account_required', 'Make a free account', '/claim'],
    ['too_many_challenges', 'See my challenges', '/'],
  ])('%s', async (code, button, path) => {
    const { app } = await open('/challenge/bob', {
      'POST /api/v1/challenges': error(409, code, 'No.'),
      'GET /api/v1/games': { status: 200, body: [game({ id: 'g5', server_time: now() })] },
      'GET /api/v1/games/g5': { status: 200, body: game({ id: 'g5', server_time: now() }) },
    });
    await screen.findByRole('button', { name: 'Send challenge' });
    await press('Send challenge');
    await screen.findByRole('button', { name: button });
    await press(button);
    await waitFor(() => expect(app.getPathname()).toBe(path));
  });

  test('busy, but no live game to go to: just the message', async () => {
    await open('/challenge/bob', { 'POST /api/v1/challenges': error(409, 'player_busy', 'No.') });
    await screen.findByRole('button', { name: 'Send challenge' });
    await press('Send challenge');
    expect(await screen.findByText('No.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Go to my game' })).toBeNull();
  });

  test('a refusal with nothing to offer is just the message', async () => {
    await open('/challenge/bob', {
      'POST /api/v1/challenges': error(409, 'player_offline', 'bob is not online.'),
    });
    await screen.findByRole('button', { name: 'Send challenge' });
    await press('Send challenge');
    expect(await screen.findByText('bob is not online.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button').map((b) => b.props['aria-label'])).not.toContain(
      'Play casual instead',
    );
  });
});

describe('my challenges', () => {
  test('one that ran out is said, not silently dropped', async () => {
    const lapsed = challenge({
      id: 'c9',
      challenger: ALICE,
      opponent: BOB,
      created_at: now(), // the device's clock follows the server's, as heard
      expires_at: inSeconds(-5),
    });
    const link = challenge({
      id: 'c10',
      challenger: ALICE,
      opponent: null,
      code: 'abc',
      created_at: now(),
      expires_at: inSeconds(-5),
    });
    await open('/', {
      'GET /api/v1/challenges': { status: 200, body: { incoming: [], outgoing: [lapsed, link] } },
    });
    expect(await screen.findByText('Your challenge to bob expired')).toBeOnTheScreen();
  });
});
