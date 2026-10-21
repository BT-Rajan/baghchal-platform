import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { BOB, game } from './support/games';
import { PLANS, PLUS_UNTIL } from './support/plans';

import type { Appearance } from '@/api/endpoints';
import { FREE_APPEARANCE } from '@/appearance/catalog';
import { playSound } from '@/components/game/sound';

jest.mock('@/components/game/sound', () => ({ soundSupported: () => true, playSound: jest.fn() }));

const played = playSound as jest.Mock;
const URL = '/api/v1/me/appearance';
const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const PLUS = { 'GET /api/v1/me/plan': { status: 200, body: PLUS_UNTIL } };

function open(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

const radio = (name: string | RegExp) => screen.getByRole('radio', { name });

describe('board, pieces and sounds', () => {
  test('Free keeps the first of each, and says what Plus adds', async () => {
    const { app, server } = await open('/settings', {
      'GET /api/v1/players/alice': {
        status: 200,
        body: { ...ME, online: true, playing: false, blocked: false, ratings: {} },
      },
      'GET /api/v1/blocks': { status: 200, body: [] },
    });
    await fireEvent.press(await screen.findByRole('link', { name: 'Board, pieces and sounds' }));
    await waitFor(() => expect(app.getPathname()).toBe('/appearance'));
    expect(
      await screen.findByText('More boards, pieces and sound packs, and a badge by your name.'),
    ).toBeOnTheScreen();
    expect(radio('Wood')).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Badge' })).toBeNull();

    // Locked choices are marked with the plan that has them, and the upsell says why.
    expect(radio('Walnut, comes with Plus')).toBeDisabled();
    expect(screen.getByText('Walnut · Plus')).toBeOnTheScreen();
    await fireEvent.press(radio('Sounds and messages'));
    // A locked sound pack pressed: the upsell beside the packs names it, nothing is chosen.
    await fireEvent.press(radio(/^Temple bells · Plus: /));
    expect(screen.getByText(/^Use Temple bells and the other sound packs/)).toBeOnTheScreen();
    expect(radio(/^Gentle: /)).toBeChecked();
    await fireEvent.press(radio('Board and pieces'));
    expect(radio('Wood')).toBeChecked();
    expect(server.requests.some((r) => r.method === 'PATCH')).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Get ClawPlay Plus' }));
    await waitFor(() => expect(app.getPathname()).toBe('/plans'));
  });

  test('Plus chooses, and hears, and hides the badge', async () => {
    let saved: Appearance = FREE_APPEARANCE;
    const { server } = await open('/appearance', {
      ...PLUS,
      [`GET ${URL}`]: () => ({ status: 200, body: saved }),
      [`PATCH ${URL}`]: (request) => {
        saved = { ...saved, ...(request.body as Partial<Appearance>) };
        return { status: 200, body: saved };
      },
    });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Walnut' }));
    await waitFor(() => expect(saved.board).toBe('walnut'));
    await waitFor(() => expect(radio('Walnut')).toBeChecked());
    await fireEvent.press(radio('Porcelain'));
    await fireEvent.press(radio('Sounds and messages'));
    await fireEvent.press(radio(/^Temple bells/));
    // Only what changed is sent; the rest stays as it was.
    await waitFor(() => expect(server.lastTo(`PATCH ${URL}`).body).toEqual({ sounds: 'bells' }));
    expect(saved).toEqual({
      ...FREE_APPEARANCE,
      board: 'walnut',
      pieces: 'porcelain',
      sounds: 'bells',
    });

    await fireEvent.press(radio('Off'));
    await waitFor(() => expect(saved.sounds_on).toBe(false));
    await waitFor(() => expect(radio('Off')).toBeChecked());

    played.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Hear Temple bells' }));
    await waitFor(() =>
      expect(played.mock.calls).toEqual([
        ['move', 'bells'],
        ['capture', 'bells'],
      ]),
    );

    await fireEvent.press(radio('Badge'));
    await fireEvent.press(radio('Nothing'));
    await waitFor(() => expect(saved.show_badge).toBe(false));
  });

  test('a refused choice is put back, and a failed load can be retried', async () => {
    let fail = true;
    await open('/appearance', {
      ...PLUS,
      [`GET ${URL}`]: () =>
        fail ? error(400, 'bad', 'Appearance is down.') : { status: 200, body: FREE_APPEARANCE },
      [`PATCH ${URL}`]: error(403, 'upgrade_required', 'Your plan has ended.'),
    });
    expect(await screen.findByText('Appearance is down.')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Slate' }));
    expect(await screen.findByText('Your plan has ended.')).toBeOnTheScreen();
    await waitFor(() => expect(radio('Wood')).toBeChecked());
  });

  test('a game plays with my sound pack', async () => {
    played.mockClear();
    await open('/game/g1', {
      [`GET ${URL}`]: {
        status: 200,
        body: { ...FREE_APPEARANCE, board: 'night', sounds: 'arcade' },
      },
      'GET /api/v1/games/g1': {
        status: 200,
        body: game({
          ply: 1,
          side_to_move: 'tiger',
          moves: ['c3'],
          server_time: new Date().toISOString(),
        }),
      },
    });
    await screen.findByText('bob to move');
    const socket = FakeSocket.latest();
    await act(() => socket.open());
    await act(() => {
      socket.receive({
        type: 'game',
        game: game({
          ply: 2,
          position: 'T3T/5/2G2/5/1T2T g 19 0',
          moves: ['c3', 'a1-b1'],
          server_time: new Date().toISOString(),
        }),
      });
    });
    await waitFor(() => expect(played).toHaveBeenCalledWith('move', 'arcade'));
  });
});

describe('badges', () => {
  test('on a profile', async () => {
    await open('/player/bob', {
      'GET /api/v1/players/bob': {
        status: 200,
        body: {
          ...BOB,
          badge: 'pro',
          online: true,
          playing: false,
          blocked: false,
          created_at: ME.created_at,
          ratings: {},
        },
      },
    });
    expect(await screen.findByLabelText('ClawPlay Pro')).toBeOnTheScreen();
  });

  test('in a game', async () => {
    await open('/game/g1', {
      'GET /api/v1/games/g1': {
        status: 200,
        body: game({ tiger: { ...BOB, badge: 'plus' }, server_time: new Date().toISOString() }),
      },
    });
    expect(await screen.findByLabelText('ClawPlay Plus')).toBeOnTheScreen();
  });

  test('on the leaderboard', async () => {
    await open('/leaderboard', {
      'GET /api/v1/leaderboards/blitz': {
        status: 200,
        body: [{ rank: 1, player: { ...BOB, badge: 'pro' }, rating: 1700, games: 30 }],
      },
    });
    expect(await screen.findByLabelText('ClawPlay Pro')).toBeOnTheScreen();
  });

  test('among players online', async () => {
    await open('/', {
      'GET /api/v1/players/online': {
        status: 200,
        body: [{ ...BOB, badge: 'plus', online: true, playing: false }],
      },
      'GET /api/v1/seeks': { status: 200, body: [] },
    });
    expect(await screen.findByLabelText('ClawPlay Plus')).toBeOnTheScreen();
  });
});

test('plans no longer call themes and badges coming soon', async () => {
  expect(PLANS[1]!.features).toContain('themes');
  await open('/plans');
  await fireEvent.press(await screen.findByRole('button', { name: 'Compare the plans' }));
  expect(await screen.findByText('Board and coin themes, and sound packs')).toBeOnTheScreen();
  expect(screen.getByText('A badge next to your name')).toBeOnTheScreen();
});
