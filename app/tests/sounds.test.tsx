import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { game } from './support/games';

import { playSound } from '@/components/game/sound';

jest.mock('@/components/game/sound', () => ({ soundSupported: () => true, playSound: jest.fn() }));

const now = () => new Date().toISOString();
const played = playSound as jest.Mock;

test('moves and captures sound as they arrive, until sounds are turned off', async () => {
  played.mockClear();
  const start = game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() });
  await renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
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

  await fireEvent.press(screen.getByRole('button', { name: 'Turn sounds off' }));
  await arrive(5, 'T3T/5/1TG2/2G2/4T t 17 1', ['c3', 'a1-b1', 'b2', 'b1xb3', 'c2']);
  expect(await screen.findByText('bob to move')).toBeOnTheScreen();
  expect(played).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('button', { name: 'Turn sounds on' })).toBeOnTheScreen();
});
