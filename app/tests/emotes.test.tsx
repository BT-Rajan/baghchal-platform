import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { game } from './support/games';

import type { Game } from '@/api/endpoints';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };

function openGame(g: Game, routes = {}) {
  return renderApp('/game/g1', {
    token: 'tok',
    routes: { ...SIGNED_IN, 'GET /api/v1/games/g1': { status: 200, body: g }, ...routes },
  });
}

describe('quick messages', () => {
  test('send one, see the reply, and hide them', async () => {
    const { server } = await openGame(game({ server_time: new Date().toISOString() }), {
      'POST /api/v1/games/g1/emote': { status: 204 },
      'PATCH /api/v1/me/appearance': (request: { body: unknown }) => ({
        status: 200,
        body: {
          board: 'wood',
          pieces: 'classic',
          sounds: 'gentle',
          sounds_on: true,
          show_badge: true,
          emotes_on: true,
          ...(request.body as object),
        },
      }),
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Say “Good luck!”' }));
    expect(await screen.findByText('Good luck!', { exact: true, hidden: false })).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/games/g1/emote').body).toEqual({ emote: 'good_luck' });

    await act(() => {
      FakeSocket.latest().open();
      FakeSocket.latest().receive({ type: 'emote', game_id: 'g1', side: 'tiger', emote: 'oops' });
    });
    // The chip, and bob's bar.
    await waitFor(() => expect(screen.getAllByText('Oops!').length).toBeGreaterThan(1));

    await fireEvent.press(screen.getByRole('button', { name: "Hide your opponent's messages" }));
    await waitFor(() =>
      expect(server.lastTo('PATCH /api/v1/me/appearance').body).toEqual({ emotes_on: false }),
    );
  });

  test('none against the computer', async () => {
    await openGame(
      game({
        tiger: { id: 'cpu', username: 'computer-easy' },
        computer: 'easy',
        server_time: new Date().toISOString(),
      }),
    );
    await screen.findByText('Your move');
    expect(screen.queryByRole('button', { name: 'Say “Good luck!”' })).toBeNull();
  });
});
