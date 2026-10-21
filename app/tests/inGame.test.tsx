import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Game } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, type Route } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { game } from './support/games';

const now = () => new Date().toISOString();
/** A moment later: the server's newer view of the same move. */
const later = () => new Date(Date.now() + 1000).toISOString();
const CHAT = 'GET /api/v1/games/g1/chat';

function openGame(g: Game, routes: Record<string, Route> = {}) {
  return renderApp(`/game/${g.id}`, {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      [`GET /api/v1/games/${g.id}`]: { status: 200, body: g },
      ...routes,
    },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

const point = (label: string | RegExp) => screen.getByRole('button', { name: label });

/** A game under way, both sides having moved: alice (goats) to move. */
const UNDER_WAY = {
  ply: 2,
  position: 'T3T/5/2G2/5/1T2T g 19 0',
  moves: ['c3', 'a1-b1'],
  legal_moves: ['a2'],
};

describe('draws', () => {
  test('I offer one; the button says so until it is answered', async () => {
    const offered = game({ ...UNDER_WAY, draw_offer: 'goat', server_time: later() });
    const { server } = await openGame(game({ ...UNDER_WAY, server_time: now() }), {
      'POST /api/v1/games/g1/draw': { status: 200, body: offered },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Offer a draw' }));
    expect(await screen.findByRole('button', { name: 'Draw offered' })).toBeDisabled();
    expect(server.lastTo('POST /api/v1/games/g1/draw')).toBeDefined();
  });

  test("my opponent's offer: accept it, and the game is drawn", async () => {
    const drawn = game({
      ...UNDER_WAY,
      status: 'finished',
      result: { winner: null, reason: 'draw_agreed' },
      legal_moves: [],
      server_time: now(),
    });
    await openGame(game({ ...UNDER_WAY, draw_offer: 'tiger', server_time: now() }), {
      'POST /api/v1/games/g1/draw': { status: 200, body: drawn },
    });
    expect(await screen.findByText('bob offers a draw.')).toBeOnTheScreen();
    await press('Accept the draw');
    expect(await screen.findByText('Drawn by agreement.')).toBeOnTheScreen();
  });

  test('or decline it, and play on', async () => {
    const { server } = await openGame(
      game({ ...UNDER_WAY, draw_offer: 'tiger', server_time: now() }),
      {
        'POST /api/v1/games/g1/draw/decline': {
          status: 200,
          body: game({ ...UNDER_WAY, server_time: later() }),
        },
      },
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Decline' }));
    expect(await screen.findByRole('button', { name: 'Offer a draw' })).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/games/g1/draw/decline')).toBeDefined();
  });

  test('the computer is never offered one', async () => {
    await openGame(
      game({
        ...UNDER_WAY,
        tiger: { id: 'cpu', username: 'computer-medium' },
        computer: 'medium',
        server_time: now(),
      }),
    );
    expect(await screen.findByRole('button', { name: 'Resign' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Offer a draw' })).toBeNull();
  });
});

describe('chat', () => {
  test('two adults write to each other; messages arrive live', async () => {
    const { server } = await openGame(game({ ...UNDER_WAY, server_time: now() }), {
      [CHAT]: {
        status: 200,
        body: {
          open: true,
          closed_because: null,
          messages: [{ side: 'tiger', text: 'good luck', sent_at: '2026-01-01T12:00:00Z' }],
        },
      },
      'POST /api/v1/games/g1/chat': {
        status: 201,
        body: { side: 'goat', text: 'you too', sent_at: '2026-01-01T12:00:05Z' },
      },
    });
    expect(await screen.findByText('Chat')).toBeOnTheScreen();
    expect(screen.getByText(/good luck/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Message'), ' you too ');
    await press('Send');
    expect(await screen.findByText(/you too/)).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/games/g1/chat').body).toEqual({ text: 'you too' });
    await act(() => {
      const socket = FakeSocket.latest();
      socket.open();
      // The server's echo of my own message is not shown twice.
      socket.receive({
        type: 'chat',
        game_id: 'g1',
        side: 'goat',
        text: 'you too',
        sent_at: '2026-01-01T12:00:05Z',
      });
      socket.receive({
        type: 'chat',
        game_id: 'g1',
        side: 'tiger',
        text: 'nice move',
        sent_at: '2026-01-01T12:00:09Z',
      });
    });
    expect(await screen.findByText(/nice move/)).toBeOnTheScreen();
    expect(screen.getAllByText(/you too/)).toHaveLength(1);
  });

  test('there is no chat with a guest; turned off, it says how to turn it on', async () => {
    await openGame(game({ ...UNDER_WAY, server_time: now() }), {
      [CHAT]: { status: 200, body: { open: false, closed_because: 'guest', messages: [] } },
    });
    expect(await screen.findByRole('button', { name: 'Resign' })).toBeOnTheScreen();
    expect(screen.queryByText('Chat')).toBeNull();
    await openGame(game({ ...UNDER_WAY, server_time: now() }), {
      [CHAT]: { status: 200, body: { open: false, closed_because: 'messages_off', messages: [] } },
    });
    expect(
      await screen.findByText(/^Chat is off because one of you has turned messages off/),
    ).toBeOnTheScreen();
  });
});

describe('premoves', () => {
  test("chosen on my opponent's turn, played the moment it is mine", async () => {
    const waiting = game({
      ...UNDER_WAY,
      ply: 3,
      side_to_move: 'tiger',
      moves: [...UNDER_WAY.moves, 'a2'],
      position: 'T3T/5/2G2/G4/1T2T t 18 0',
      legal_moves: [],
      server_time: now(),
    });
    const myTurn = game({
      ...UNDER_WAY,
      ply: 4,
      side_to_move: 'goat',
      moves: [...waiting.moves, 'b1-c1'],
      position: 'T3T/5/2G2/G4/2T1T g 18 0',
      legal_moves: ['e3', 'b2'],
      server_time: now(),
    });
    const { server } = await openGame(waiting, {
      'POST /api/v1/games/g1/moves': {
        status: 200,
        body: game({ ...myTurn, ply: 5, side_to_move: 'tiger', legal_moves: [] }),
      },
    });
    await screen.findByText('bob to move');
    await fireEvent.press(point(/^e3, empty/));
    expect(await screen.findByText('Premove: e3, played when it is your turn')).toBeOnTheScreen();
    await act(() => {
      const socket = FakeSocket.latest();
      socket.open();
      socket.receive({ type: 'game', game: myTurn });
    });
    await waitFor(() =>
      expect(server.lastTo('POST /api/v1/games/g1/moves').body).toEqual({ ply: 4, move: 'e3' }),
    );
  });

  test('a premove can be cancelled, and one no longer legal is dropped', async () => {
    const waiting = game({
      ...UNDER_WAY,
      ply: 3,
      side_to_move: 'tiger',
      moves: [...UNDER_WAY.moves, 'a2'],
      position: 'T3T/5/2G2/G4/1T2T t 18 0',
      legal_moves: [],
      server_time: now(),
    });
    const { server } = await openGame(waiting);
    await screen.findByText('bob to move');
    await fireEvent.press(point(/^e3, empty/));
    await press('Cancel the premove');
    expect(screen.queryByText(/^Premove:/)).toBeNull();
    await fireEvent.press(point(/^e3, empty/));
    await act(() => {
      const socket = FakeSocket.latest();
      socket.open();
      // bob's tiger took e3 meanwhile: the premove cannot be played.
      socket.receive({
        type: 'game',
        game: game({
          ...waiting,
          ply: 4,
          side_to_move: 'goat',
          legal_moves: ['b2'],
          position: 'T3T/5/2G1T/G4/1T3 g 18 0',
          server_time: now(),
        }),
      });
    });
    expect(await screen.findByText('Your move')).toBeOnTheScreen();
    expect(screen.queryByText(/^Premove:/)).toBeNull();
    expect(
      screen.getByText('Your premove e3 is no longer possible: make your move.'),
    ).toBeOnTheScreen();
    expect(server.requests.some((r) => r.path === '/api/v1/games/g1/moves')).toBe(false);
  });
});
