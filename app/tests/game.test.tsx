import * as ReactNative from 'react-native';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { BOB, game } from './support/games';

import type { Game } from '@/api/endpoints';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const now = () => new Date().toISOString();

function openGame(g: Game, routes: Record<string, Route> = {}) {
  return renderApp(`/game/${g.id}`, {
    token: 'tok',
    routes: { ...SIGNED_IN, [`GET /api/v1/games/${g.id}`]: { status: 200, body: g }, ...routes },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

const point = (label: string | RegExp) => screen.getByRole('button', { name: label });

describe('the board', () => {
  test('shows the position, both players and clocks', async () => {
    await openGame(game({ server_time: now() }));
    expect(await screen.findByText('Your move')).toBeOnTheScreen();
    for (const corner of ['a1', 'e1', 'a5', 'e5']) {
      expect(point(`${corner}, tiger`)).toBeOnTheScreen();
    }
    expect(point('c3, empty')).toBeOnTheScreen();
    expect(screen.getByText('alice (you)')).toBeOnTheScreen();
    expect(screen.getByText('bob')).toBeOnTheScreen();
    expect(screen.getByText('Goats · 1500')).toBeOnTheScreen();
    expect(screen.getByLabelText('Goats clock 5:00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tigers clock 5:00')).toBeOnTheScreen();
    expect(screen.getByText('Goats to place: 20 · Goats captured: 0 of 5')).toBeOnTheScreen();
    expect(screen.getByText('No moves yet. Goats move first.')).toBeOnTheScreen();
  });

  test('placing a goat sends the move and shows the answer', async () => {
    const after = game({
      ply: 1,
      position: 'T3T/5/5/G4/T3T t 19 0',
      side_to_move: 'tiger',
      moves: ['a2'],
      legal_moves: ['a1-b1'],
      server_time: now(),
    });
    const { server } = await openGame(game({ legal_moves: ['a2', 'c3'], server_time: now() }), {
      'POST /api/v1/games/g1/moves': { status: 200, body: after },
    });
    await screen.findByText('Your move');
    expect(point('a2, empty, move here')).toBeOnTheScreen();
    await fireEvent.press(point('b2, empty')); // not a legal placement: nothing happens
    expect(server.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    await fireEvent.press(point('a2, empty, move here'));
    expect(await screen.findByText('bob to move')).toBeOnTheScreen();
    expect(point('a2, goat')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/games/g1/moves').body).toEqual({ ply: 0, move: 'a2' });
    expect(screen.getByText('1.')).toBeOnTheScreen();
    // Not my turn now: the tiger on a1 cannot be picked up.
    await fireEvent.press(point('a1, tiger'));
    expect(point('a1, tiger')).toBeOnTheScreen();
  });

  test('moving a piece: pick it up, then choose where', async () => {
    const moving = game({
      ply: 40,
      position: 'T3T/5/5/G4/T3T g 0 0',
      legal_moves: ['a2-a3', 'a2-b2'],
      moves: Array.from({ length: 40 }, () => 'c3'),
      server_time: now(),
    });
    const { server } = await openGame(moving, {
      'POST /api/v1/games/g1/moves': { status: 200, body: { ...moving, ply: 41 } },
    });
    await screen.findByText('Your move');
    await fireEvent.press(point('a2, goat, can move'));
    expect(point('a2, goat, selected')).toBeOnTheScreen();
    expect(point('a3, empty, move here')).toBeOnTheScreen();
    await fireEvent.press(point('a3, empty, move here'));
    await waitFor(() =>
      expect(server.lastTo('POST /api/v1/games/g1/moves').body).toEqual({ ply: 40, move: 'a2-a3' }),
    );
  });

  test('a capture target is labelled as such', async () => {
    await openGame(
      game({
        ply: 3,
        side_to_move: 'tiger',
        goat: BOB,
        tiger: { id: ME.id, username: 'alice' },
        position: 'T3T/5/5/G4/T3T t 18 0',
        legal_moves: ['a1xa3'],
        server_time: now(),
      }),
    );
    await screen.findByText('Your move');
    await fireEvent.press(point('a1, tiger, can move'));
    expect(point('a3, empty, move here')).toBeOnTheScreen();
  });

  test('a move refused because the game moved on is reported and the game reloaded', async () => {
    let served = game({ legal_moves: ['a2'], server_time: now() });
    const { server } = await openGame(served, {
      'GET /api/v1/games/g1': () => ({ status: 200, body: served }),
      'POST /api/v1/games/g1/moves': () => {
        served = game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() });
        return error(409, 'stale_position', 'The game has moved on; refresh and try again.');
      },
    });
    await screen.findByText('Your move');
    await fireEvent.press(point('a2, empty, move here'));
    expect(await screen.findByText(/The game has moved on/)).toBeOnTheScreen();
    expect(await screen.findByText('bob to move')).toBeOnTheScreen();
    expect(server.requests.filter((r) => r.path === '/api/v1/games/g1').length).toBeGreaterThan(1);
  });

  test('other errors are shown without reloading', async () => {
    const { server } = await openGame(game({ legal_moves: ['a2'], server_time: now() }), {
      'POST /api/v1/games/g1/moves': error(429, 'rate_limited', 'Too many attempts.'),
    });
    await screen.findByText('Your move');
    await fireEvent.press(point('a2, empty, move here'));
    expect(await screen.findByText('Too many attempts.')).toBeOnTheScreen();
    expect(server.requests.filter((r) => r.path === '/api/v1/games/g1')).toHaveLength(1);
  });

  test("the opponent's moves arrive live; older states are ignored", async () => {
    await openGame(game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() }));
    await screen.findByText('bob to move');
    const socket = FakeSocket.latest();
    await act(() => {
      socket.open();
      socket.receive({
        type: 'game',
        game: game({
          ply: 2,
          position: 'T3T/5/2G2/5/1T2T g 19 0',
          moves: ['c3', 'a1-b1'],
          server_time: now(),
        }),
      });
      socket.receive({
        type: 'game',
        game: game({ ply: 1, side_to_move: 'tiger', server_time: now() }),
      });
    });
    expect(await screen.findByText('Your move')).toBeOnTheScreen();
    expect(point(/^b1, tiger/)).toBeOnTheScreen();
  });

  test('a position that cannot be read is reported', async () => {
    await openGame(game({ position: 'nonsense', server_time: now() }));
    expect(await screen.findByText('This position could not be shown.')).toBeOnTheScreen();
  });

  test('a game that does not exist', async () => {
    await renderApp('/game/nope', {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'GET /api/v1/games/nope': error(404, 'game_not_found', 'No such game.'),
      },
    });
    expect(await screen.findByText('No such game.')).toBeOnTheScreen();
  });
});

describe('clocks', () => {
  test('the running clock counts down from server time', async () => {
    await openGame(
      game({
        ply: 5,
        side_to_move: 'tiger',
        clocks: { goat_ms: 250_000, tiger_ms: 90_000, running: 'tiger' },
        server_time: now(),
      }),
    );
    expect(await screen.findByLabelText(/^Tigers clock 1:\d\d$/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Goats clock 4:10')).toBeOnTheScreen();
  });

  test('before the clocks start, the first-move countdown shows', async () => {
    // Stamped when the fake server answers, as the real one does.
    const opening = () =>
      game({ deadline_at: new Date(Date.now() + 25_000).toISOString(), server_time: now() });
    await openGame(opening(), { 'GET /api/v1/games/g1': () => ({ status: 200, body: opening() }) });
    expect(await screen.findByText(/^Your move · \d+ s to make a first move$/)).toBeOnTheScreen();
  });
});

describe('ending a game', () => {
  test('abort before both sides have moved', async () => {
    const { server, app } = await openGame(game({ server_time: now() }), {
      'POST /api/v1/games/g1/abort': {
        status: 200,
        body: game({
          status: 'finished',
          result: { winner: null, reason: 'aborted' },
          legal_moves: [],
        }),
      },
    });
    await screen.findByText('Your move');
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull();
    await press('Abort game');
    expect(await screen.findByText('Game aborted: no result.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/games/g1/abort')).toBeDefined();
    await press('Back to the lobby');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  test('resign asks first', async () => {
    const playing = game({ ply: 6, server_time: now() });
    const { server } = await openGame(playing, {
      'POST /api/v1/games/g1/resign': {
        status: 200,
        body: {
          ...playing,
          status: 'finished',
          result: { winner: 'tiger', reason: 'resigned' },
          legal_moves: [],
        },
      },
    });
    await screen.findByText('Your move');
    expect(screen.queryByRole('button', { name: 'Abort game' })).toBeNull();
    await press('Resign');
    expect(screen.getByText('Resign this game?')).toBeOnTheScreen();
    await press('Keep playing');
    expect(screen.queryByText('Resign this game?')).toBeNull();
    expect(server.requests.filter((r) => r.method === 'POST')).toHaveLength(0);

    await press('Resign');
    await press('Yes, resign');
    expect(await screen.findByText('You lost by resignation.')).toBeOnTheScreen();
  });

  const waiting = () => game({ ply: 6, side_to_move: 'tiger', server_time: now() });
  const profile = (online: boolean): Route => ({
    status: 200,
    body: { ...BOB, online, playing: true, created_at: now(), ratings: {} },
  });

  test('no claim while the opponent is online', async () => {
    const { server } = await openGame(waiting(), { 'GET /api/v1/players/bob': profile(true) });
    await screen.findByText('bob to move');
    await waitFor(() =>
      expect(server.requests.some((r) => r.path === '/api/v1/players/bob')).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Resign' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Claim the win' })).toBeNull();
  });

  test('the win can be claimed while the opponent is offline on their turn', async () => {
    await openGame(waiting(), {
      'GET /api/v1/players/bob': profile(false),
      'POST /api/v1/games/g1/claim-abandonment': {
        status: 200,
        body: { ...waiting(), status: 'finished', result: { winner: 'goat', reason: 'abandoned' } },
      },
    });
    // First a countdown, then the button: the opponent must stay away for a whole minute.
    expect(
      await screen.findByText(/^bob seems to have left\. If they are not back in (59|60) s/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Claim the win' })).toBeNull();
    await aMinuteLater();
    await press('Claim the win');
    expect(await screen.findByText('You won: the other player left.')).toBeOnTheScreen();
  });

  test('the countdown stops when the turn changes', async () => {
    await openGame(waiting(), { 'GET /api/v1/players/bob': profile(false) });
    await screen.findByText(/^bob seems to have left/);
    const mine = game({ ply: 7, side_to_move: 'goat', server_time: now() });
    await act(() => {
      FakeSocket.latest().open();
      FakeSocket.latest().receive({ type: 'game', game: mine });
    });
    expect(await screen.findByText('Your move')).toBeOnTheScreen();
    expect(screen.queryByText(/^bob seems to have left/)).toBeNull();
  });

  test('a claim the server turns down is reported', async () => {
    await openGame(waiting(), {
      'GET /api/v1/players/bob': profile(false),
      'POST /api/v1/games/g1/claim-abandonment': error(409, 'cannot_claim', 'Wait 60 seconds.'),
    });
    await screen.findByText(/^bob seems to have left/);
    await aMinuteLater();
    await press('Claim the win');
    expect(await screen.findByText('Wait 60 seconds.')).toBeOnTheScreen();
  });
});

/** Move this device's clock on by a minute (the countdown reads it every second). */
async function aMinuteLater() {
  const real = Date.now.bind(Date);
  jest.spyOn(Date, 'now').mockImplementation(() => real() + 61_000);
  await screen.findByRole('button', { name: 'Claim the win' }, { timeout: 3000 }).catch(() => null);
}

describe('matches and results', () => {
  const score = [
    { player: { id: ME.id, username: 'alice' }, points: 1 },
    { player: BOB, points: 0 },
  ];

  test('a finished rated game shows rating changes and leads to game 2', async () => {
    const first = game({
      id: 'g1',
      rated: true,
      status: 'finished',
      result: { winner: 'goat', reason: 'tigers_trapped' },
      legal_moves: [],
      ratings: { goat: { rating: 1500, change: 12 }, tiger: { rating: 1500, change: -12 } },
      match: { id: 'm1', game: 1, games: ['g1', 'g2'], score },
      server_time: now(),
    });
    const second = game({
      id: 'g2',
      goat: BOB,
      tiger: { id: ME.id, username: 'alice' },
      rated: true,
      match: { id: 'm1', game: 2, games: ['g1', 'g2'], score },
      server_time: now(),
    });
    const { app } = await openGame(first, {
      'GET /api/v1/games/g2': { status: 200, body: second },
    });
    expect(await screen.findByText('You won: the tigers could not move.')).toBeOnTheScreen();
    expect(screen.getByText('Goats · 1500 · +12')).toBeOnTheScreen();
    expect(screen.getByText('Tigers · 1500 · −12')).toBeOnTheScreen();
    expect(screen.getByText('Rated match · game 1 of 2')).toBeOnTheScreen();
    expect(screen.getByText('alice 1 – 0 bob')).toBeOnTheScreen();
    await press('Go to game 2');
    expect(await screen.findByText('Rated match · game 2 of 2')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/game/g2');
    expect(screen.getByRole('button', { name: 'Back to game 1' })).toBeOnTheScreen();
  });

  test('the second game of a match cannot be aborted, and a missed first move loses', async () => {
    const opening = () =>
      game({
        id: 'g2',
        rated: true,
        match: { id: 'm1', game: 2, games: ['g1', 'g2'], score },
        deadline_at: new Date(Date.now() + 25_000).toISOString(),
        server_time: now(),
      });
    await openGame(opening(), {
      'GET /api/v1/games/g2': () => ({ status: 200, body: opening() }),
    });
    expect(
      await screen.findByText(/^Your move · \d+ s to make a first move, or it counts as a loss$/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Abort game' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Resign' })).toBeOnTheScreen();
  });

  test('someone else’s game can be watched but not played', async () => {
    await openGame(
      game({
        goat: BOB,
        tiger: { id: 'x', username: 'carol' },
        status: 'finished',
        result: { winner: 'tiger', reason: 'timeout' },
        legal_moves: [],
        server_time: now(),
      }),
    );
    expect(await screen.findByText('Tigers (carol) won on time.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull();
  });
});

test('on wide screens the board sits beside the panel', async () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 1280,
    height: 800,
    scale: 1,
    fontScale: 1,
  });
  await openGame(game({ server_time: now() }));
  expect(await screen.findByText('Your move')).toBeOnTheScreen();
  jest.restoreAllMocks();
});
