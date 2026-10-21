import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { GameSummary } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, game } from './support/games';
import { PLUS_UNTIL } from './support/plans';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const COMPUTER = { id: '00000000-0000-4000-8000-0000000000cc', username: 'computer-hard' };
const now = () => new Date().toISOString();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const SEEKS = 'GET /api/v1/seeks';

function signedIn(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, {
    token: 'tok',
    routes: { ...SIGNED_IN, [SEEKS]: { status: 200, body: [] }, ...routes },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

describe('play now', () => {
  test('the lobby leads to it', async () => {
    const { app } = await signedIn('/');
    await screen.findByRole('button', { name: 'Play now' });
    await press('Play now');
    expect(await screen.findByRole('button', { name: 'Find an opponent' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/play');
  });

  test('someone is waiting: the game opens at once', async () => {
    const started = game({ server_time: now() });
    const { server, app } = await signedIn('/play', {
      [SEEKS]: { status: 200, body: [{ time_control: 'sand', rated: true, players: 1 }] },
      'POST /api/v1/seeks': {
        status: 200,
        body: { status: 'paired', game: started, expires_at: null },
      },
      'GET /api/v1/games/g1': { status: 200, body: started },
    });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Sand clock' }));
    expect(screen.getByText(/^Sand clock: one minute each\./)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Rated' }));
    expect(screen.getByText(/^A rated match is two games/)).toBeOnTheScreen();
    expect(await screen.findByText('1 player is waiting.')).toBeOnTheScreen();
    await press('Find an opponent');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
    expect(server.lastTo('POST /api/v1/seeks').body).toEqual({
      time_control: 'sand',
      rated: true,
    });
  });

  test('waiting, then stopping', async () => {
    const { server } = await signedIn('/play', {
      'POST /api/v1/seeks': {
        status: 200,
        body: { status: 'waiting', game: null, expires_at: inSeconds(120) },
      },
      'DELETE /api/v1/seeks': { status: 204 },
    });
    expect(await screen.findByText('Nobody is waiting for this game right now.')).toBeOnTheScreen();
    await press('Find an opponent');
    expect(
      await screen.findByText(/^Looking for an opponent for 5\+3 casual… \d+ s$/),
    ).toBeOnTheScreen();
    await press('Stop looking');
    expect(await screen.findByRole('button', { name: 'Find an opponent' })).toBeOnTheScreen();
    expect(server.requests.some((r) => r.method === 'DELETE' && r.path === '/api/v1/seeks')).toBe(
      true,
    );
  });

  test('a wait that ran out, and leaving while waiting', async () => {
    let expires = inSeconds(-1);
    const { server } = await signedIn('/play', {
      'POST /api/v1/seeks': () => ({
        status: 200,
        body: { status: 'waiting', game: null, expires_at: expires },
      }),
      'DELETE /api/v1/seeks': { status: 204 },
    });
    await screen.findByRole('button', { name: 'Find an opponent' });
    await press('Find an opponent');
    expect(
      await screen.findByText('Nobody came along yet. Try again, or play the computer.'),
    ).toBeOnTheScreen();
    expires = inSeconds(120);
    await press('Keep looking');
    await screen.findByRole('button', { name: 'Stop looking' });
    await act(async () => router.replace('/'));
    expect(await screen.findByRole('heading', { name: 'Play' })).toBeOnTheScreen();
    await waitFor(() =>
      expect(server.requests.some((r) => r.method === 'DELETE' && r.path === '/api/v1/seeks')).toBe(
        true,
      ),
    );
  });

  test('a refusal is shown', async () => {
    await signedIn('/play', {
      'POST /api/v1/seeks': error(429, 'abort_cooldown', 'You have aborted 3 games.'),
    });
    await screen.findByRole('button', { name: 'Find an opponent' });
    await press('Find an opponent');
    expect(await screen.findByText('You have aborted 3 games.')).toBeOnTheScreen();
  });

  test('playing the computer', async () => {
    const started = game({ tiger: COMPUTER, computer: 'hard', server_time: now() });
    const { server, app } = await signedIn('/play', {
      'POST /api/v1/games/computer': { status: 201, body: started },
      'GET /api/v1/games/g1': { status: 200, body: started },
      'GET /api/v1/me/plan': { status: 200, body: PLUS_UNTIL }, // Hard comes with Plus
    });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Hard' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Goats' }));
    await fireEvent.press(screen.getByRole('radio', { name: '3+2' }));
    await press('Play the computer');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
    expect(server.lastTo('POST /api/v1/games/computer').body).toEqual({
      level: 'hard',
      side: 'goat',
      time_control: '3+2',
    });
    expect(await screen.findByText('Computer (hard)')).toBeOnTheScreen();
  });

  test('nobody watches whether the computer has left', async () => {
    const thinking = game({
      tiger: COMPUTER,
      computer: 'hard',
      ply: 3,
      moves: ['a2', 'a1-b1', 'c3'],
      position: 'T3T/5/2G2/G4/1T2T t 18 0',
      side_to_move: 'tiger',
      server_time: now(),
    });
    const { server } = await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: thinking },
    });
    expect(await screen.findByText('Computer (hard) to move')).toBeOnTheScreen();
    expect(server.requests.some((r) => r.path.startsWith('/api/v1/players/computer'))).toBe(false);
  });

  test('the computer refuses while a game is on', async () => {
    await signedIn('/play', {
      'POST /api/v1/games/computer': error(409, 'player_busy', 'Finish your live game first.'),
    });
    await screen.findByRole('button', { name: 'Play the computer' });
    await press('Play the computer');
    expect(await screen.findByText('Finish your live game first.')).toBeOnTheScreen();
  });
});

describe('a finished game', () => {
  const POSITIONS = ['T3T/5/5/5/T3T g 20 0', 'T3T/5/5/G4/T3T t 19 0', 'T3T/5/5/G4/1T2T g 19 0'];
  const finished = game({
    tiger: COMPUTER,
    computer: 'hard',
    status: 'finished',
    result: { winner: 'tiger', reason: 'resigned' },
    ply: 2,
    moves: ['a2', 'a1-b1'],
    position: POSITIONS[2]!,
    positions: POSITIONS,
    legal_moves: [],
    side_to_move: 'goat',
    server_time: now(),
  });

  test('can be stepped through', async () => {
    await signedIn('/game/g1', { 'GET /api/v1/games/g1': { status: 200, body: finished } });
    expect(await screen.findByText('After move 2 of 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();
    await press('Start position');
    expect(screen.getByText('Start position')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    await press('Next move');
    expect(screen.getByText('After move 1 of 2')).toBeOnTheScreen();
    await press('Previous move');
    expect(screen.getByText('Start position')).toBeOnTheScreen();
    await press('Final position');
    expect(screen.getByText('After move 2 of 2')).toBeOnTheScreen();
  });

  test('against the computer: play again, nobody to report', async () => {
    const again = game({
      id: 'g2',
      goat: COMPUTER,
      tiger: { id: ME.id, username: 'alice' },
      computer: 'hard',
      server_time: now(),
    });
    const { server, app } = await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: finished },
      'POST /api/v1/games/computer': { status: 201, body: again },
      'GET /api/v1/games/g2': { status: 200, body: again },
    });
    await screen.findByRole('button', { name: 'Play the computer again' });
    expect(screen.queryByRole('button', { name: /^Report/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Rematch/ })).toBeNull();
    await press('Play the computer again');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g2'));
    expect(server.lastTo('POST /api/v1/games/computer').body).toEqual({
      level: 'hard',
      side: 'tiger',
      time_control: '5+3',
    });
  });

  test('play again can fail', async () => {
    await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: finished },
      'POST /api/v1/games/computer': error(429, 'rate_limited', 'Too many games.'),
    });
    await screen.findByRole('button', { name: 'Play the computer again' });
    await press('Play the computer again');
    expect(await screen.findByText('Too many games.')).toBeOnTheScreen();
  });
});

describe('game history on a profile', () => {
  const PROFILE = {
    status: 200,
    body: {
      ...BOB,
      online: true,
      playing: false,
      blocked: false,
      created_at: ME.created_at,
      ratings: {},
    },
  };
  const summary = (i: number): GameSummary => ({
    id: `h${i}`,
    opponent: { id: ME.id, username: 'alice' },
    side: 'goat',
    time_control: '5+3',
    rated: false,
    computer: null,
    result: { winner: 'goat', reason: 'resigned' },
    outcome: 'won',
    rating_change: null,
    moves: 10,
    finished_at: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
  });

  test('lists games, opens one, and pages back', async () => {
    const first = Array.from({ length: 20 }, (_, i) => summary(i));
    const { server, app } = await signedIn('/player/bob', {
      'GET /api/v1/players/bob': PROFILE,
      'GET /api/v1/players/bob/games': (request) => ({
        status: 200,
        body: request.query.before === undefined ? first : [summary(20)],
      }),
      'GET /api/v1/games/h0': {
        status: 200,
        body: game({
          id: 'h0',
          status: 'finished',
          result: { winner: 'goat', reason: 'resigned' },
          server_time: now(),
        }),
      },
    });
    expect(await screen.findByText('Won · vs alice · 5+3 casual · 20 Oct 2026')).toBeOnTheScreen();
    // The latest five; the rest of the page, then the next one, on asking.
    expect(screen.getAllByRole('link', { name: /^Replay:/ })).toHaveLength(5);
    await press('Show more games');
    expect(await screen.findByText('Won · vs alice · 5+3 casual · 30 Sept 2026')).toBeOnTheScreen();
    expect(server.lastTo('GET /api/v1/players/bob/games').query).toEqual({
      before: first[19]!.finished_at,
    });
    expect(screen.queryByRole('button', { name: 'Show more games' })).toBeNull();
    await fireEvent.press(
      screen.getByRole('link', { name: 'Replay: Won · vs alice · 5+3 casual · 20 Oct 2026' }),
    );
    await waitFor(() => expect(app.getPathname()).toBe('/game/h0'));
  });

  test('none yet, or a failure', async () => {
    await signedIn('/player/bob', { 'GET /api/v1/players/bob': PROFILE });
    expect(await screen.findByText('No finished games yet.')).toBeOnTheScreen();
    await signedIn('/player/bob', {
      'GET /api/v1/players/bob': PROFILE,
      'GET /api/v1/players/bob/games': error(400, 'bad', 'History is down.'),
    });
    expect(await screen.findByText('History is down.')).toBeOnTheScreen();
  });
});
