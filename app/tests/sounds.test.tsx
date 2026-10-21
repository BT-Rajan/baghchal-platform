import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { renderApp } from './support/app';
import { ME, error } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { game } from './support/games';

import { FREE_APPEARANCE } from '@/appearance/catalog';

import { playSound } from '@/components/game/sound';

jest.mock('@/components/game/sound', () => ({ soundSupported: () => true, playSound: jest.fn() }));

const now = () => new Date().toISOString();
const played = playSound as jest.Mock;

test('moves and captures sound as they arrive, until sounds are turned off', async () => {
  played.mockClear();
  const start = game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() });
  const rendered = await renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'PATCH /api/v1/me/appearance': {
        status: 200,
        body: { ...FREE_APPEARANCE, sounds_on: false },
      },
      'GET /api/v1/games/g1': { status: 200, body: start },
    },
  });
  await screen.findByText('bob to move');
  expect(played).not.toHaveBeenCalled(); // opening a game is silent

  const socket = FakeSocket.latest();
  const arrive = (ply: number, position: string, moves: string[]) =>
    act(() => {
      socket.receive({
        type: 'game',
        game: game({
          ply,
          position,
          moves,
          side_to_move: ply % 2 === 0 ? 'goat' : 'tiger',
          server_time: now(),
        }),
      });
    });
  await act(() => socket.open());
  await arrive(2, 'T3T/5/2G2/5/1T2T g 19 0', ['c3', 'a1-b1']);
  await waitFor(() => expect(played.mock.calls).toEqual([['move', 'gentle']]));
  await arrive(3, 'T3T/5/2G2/1G3/1T2T t 18 0', ['c3', 'a1-b1', 'b2']);
  await waitFor(() => expect(played).toHaveBeenCalledTimes(2));
  await arrive(4, 'T3T/5/1TG2/5/4T g 18 1', ['c3', 'a1-b1', 'b2', 'b1xb3']);
  await waitFor(() =>
    expect(played.mock.calls).toEqual([
      ['move', 'gentle'],
      ['move', 'gentle'],
      ['capture', 'gentle'],
    ]),
  );

  // The same setting as on "Board, pieces and sounds": kept on the server, for every device.
  const { server } = rendered;
  await fireEvent.press(screen.getByRole('button', { name: 'Turn sounds and vibration off' }));
  await waitFor(() =>
    expect(server.lastTo('PATCH /api/v1/me/appearance').body).toEqual({ sounds_on: false }),
  );
  await arrive(5, 'T3T/5/1TG2/2G2/4T t 17 1', ['c3', 'a1-b1', 'b2', 'b1xb3', 'c2']);
  expect(await screen.findByText('bob to move')).toBeOnTheScreen();
  expect(played).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('button', { name: 'Turn sounds and vibration on' })).toBeOnTheScreen();
});

test('sounds turned off on any device stay off', async () => {
  played.mockClear();
  await renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/me/appearance': {
        status: 200,
        body: { ...FREE_APPEARANCE, sounds_on: false },
      },
      'GET /api/v1/games/g1': {
        status: 200,
        body: game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() }),
      },
    },
  });
  expect(
    await screen.findByRole('button', { name: 'Turn sounds and vibration on' }),
  ).toBeOnTheScreen();
});

test('sounds can be turned off before the setting has loaded', async () => {
  const { server } = await renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/me/appearance': error(400, 'bad', 'Not now.'),
      'PATCH /api/v1/me/appearance': {
        status: 200,
        body: { ...FREE_APPEARANCE, sounds_on: false },
      },
      'GET /api/v1/games/g1': {
        status: 200,
        body: game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() }),
      },
    },
  });
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Turn sounds and vibration off' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Turn sounds and vibration on' }),
  ).toBeOnTheScreen();
  expect(server.lastTo('PATCH /api/v1/me/appearance').body).toEqual({ sounds_on: false });
});

test('on the web the toggle is for sounds alone (nothing vibrates there)', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/games/g1': {
        status: 200,
        body: game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() }),
      },
    },
  });
  expect(await screen.findByRole('button', { name: 'Turn sounds off' })).toBeOnTheScreen();
  jest.restoreAllMocks();
});
