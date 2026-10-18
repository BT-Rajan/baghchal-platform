import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { game } from './support/games';

import type { Game } from '@/api/endpoints';
import { playSound } from '@/components/game/sound';

jest.mock('@/components/game/sound', () => ({ soundSupported: () => true, playSound: jest.fn() }));

const now = () => new Date().toISOString();
const played = playSound as jest.Mock;

function open(g: Game) {
  return renderApp(`/game/${g.id}`, {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      [`GET /api/v1/games/${g.id}`]: { status: 200, body: g },
    },
  });
}

const finished = (winner: 'goat' | 'tiger', reason: string, ply = 2) =>
  game({
    ply,
    status: 'finished',
    result: { winner, reason } as Game['result'],
    moves: ['c3', 'a1-b1'],
    position: 'T3T/5/2G2/5/1T2T g 19 0',
    legal_moves: [],
    server_time: now(),
  });

async function endLive(winner: 'goat' | 'tiger', reason: string) {
  await open(game({ ply: 1, side_to_move: 'tiger', moves: ['c3'], server_time: now() }));
  await screen.findByText('bob to move');
  const socket = FakeSocket.latest();
  await act(() => {
    socket.open();
    socket.receive({ type: 'game', game: finished(winner, reason) });
  });
}

beforeEach(() => played.mockClear());

test('a game won on screen is celebrated, with a fanfare, until closed', async () => {
  await endLive('goat', 'resigned'); // alice plays goats
  const overlay = await screen.findByRole('button', {
    name: 'You won! By resignation. Tap to close.',
  });
  expect(screen.getByText('You won!')).toBeOnTheScreen();
  await waitFor(() => expect(played).toHaveBeenCalledWith('win', 'gentle'));
  await fireEvent.press(overlay);
  expect(screen.queryByText('You won!')).toBeNull();
  expect(screen.getByText('You won by resignation.')).toBeOnTheScreen(); // the result stays
});

test('a loss says so, with a quieter sound', async () => {
  await endLive('tiger', 'five_captured');
  expect(await screen.findByText('You lost')).toBeOnTheScreen();
  expect(screen.getByText('Five goats captured')).toBeOnTheScreen();
  await waitFor(() => expect(played).toHaveBeenCalledWith('loss', 'gentle'));
});

test('opening a game that is already over shows no celebration', async () => {
  await open(finished('goat', 'timeout'));
  expect(await screen.findByText('You won on time.')).toBeOnTheScreen();
  expect(screen.queryByText('You won!')).toBeNull();
  expect(played).not.toHaveBeenCalled();
});
