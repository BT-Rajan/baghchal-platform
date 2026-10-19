import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { ApiError } from '@/api/errors';

import { ALICE, BOB, challenge as challengeFixture, game, respond } from './fixtures';

/** A fake API: answers keyed by "METHOD /path" (query strings ignored). */
const mockRoutes = new Map<string, (body: unknown) => Response>();
const mockCalls: string[] = [];

jest.mock('@/services', () => {
  const { ApiClient } = jest.requireActual('@/api/client');
  const { testQueryClient } = jest.requireActual('./fixtures');
  const fetch = async (url: string, init: RequestInit) => {
    const key = `${init.method} ${new URL(url).pathname}`;
    mockCalls.push(key);
    const route = mockRoutes.get(key);
    if (!route)
      return new Response(JSON.stringify({ error: { code: 'not_found', message: key } }), {
        status: 404,
      });
    return route(init.body ? JSON.parse(init.body as string) : undefined);
  };
  const store = { token: null as string | null };
  return {
    api: new ApiClient({ baseUrl: 'https://api.test', transport: 'bearer', fetch }),
    queryClient: testQueryClient(),
    tokenStore: {
      get: async () => store.token,
      set: async (t: string) => void (store.token = t),
      clear: async () => void (store.token = null),
    },
  };
});

const mockSockets: { onmessage: ((e: { data: string }) => void) | null; close: () => void }[] = [];
jest.mock('@/realtime/create-socket', () => ({
  createSocket: () => {
    const socket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: () => undefined,
      close: () => undefined,
    };
    mockSockets.push(socket);
    return socket;
  },
}));

const ME = { ...ALICE, email: 'alice@example.com', created_at: '2026-10-01T00:00:00Z' };
const json = (status: number, body?: unknown) => () => respond(status, body);
const signedOut = json(401, { error: { code: 'not_authenticated', message: 'Please sign in.' } });

function lobbyRoutes() {
  mockRoutes.set('GET /api/v1/games', json(200, []));
  mockRoutes.set('GET /api/v1/challenges', json(200, { incoming: [], outgoing: [] }));
  mockRoutes.set(
    'GET /api/v1/players/online',
    json(200, [{ ...BOB, online: true, playing: false }]),
  );
}

jest.setTimeout(30_000);

beforeEach(() => {
  mockRoutes.clear();
  mockCalls.length = 0;
  mockSockets.length = 0;
  const { queryClient } = jest.requireMock('@/services');
  queryClient.clear();
});

describe('signing in', () => {
  it('sends signed-out visitors to sign in, explains failures, then opens the lobby', async () => {
    mockRoutes.set('GET /api/v1/me', signedOut);
    mockRoutes.set('POST /api/v1/auth/login', (body) =>
      (body as { password: string }).password === 'right password'
        ? respond(200, { user: ME, token: 'tok' })
        : respond(401, {
            error: { code: 'invalid_credentials', message: 'Wrong username, email or password.' },
          }),
    );
    lobbyRoutes();
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Sign in' });

    await fireEvent.changeText(screen.getByLabelText('Username or email'), 'alice');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Wrong username, email or password.');

    await fireEvent.changeText(screen.getByLabelText('Password'), 'right password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Online now');
    await screen.findByText('bob');
    expect(mockSockets).toHaveLength(1);
  });

  it('explains when the server cannot be reached', async () => {
    mockRoutes.set('GET /api/v1/me', () => {
      throw new TypeError('offline');
    });
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText(/Cannot reach the server/);
    lobbyRoutes();
    mockRoutes.set('GET /api/v1/me', json(200, ME));
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Online now');
  });
});

describe('playing', () => {
  it('shows the game and sends moves with the ply the player saw', async () => {
    mockRoutes.set('GET /api/v1/me', json(200, ME));
    const g = game({ legal_moves: ['a2', 'b1'] });
    mockRoutes.set(`GET /api/v1/games/${g.id}`, json(200, g));
    mockRoutes.set(`POST /api/v1/games/${g.id}/moves`, (body) => {
      expect(body).toEqual({ ply: 0, move: 'a2' });
      return respond(
        200,
        game({
          ply: 1,
          side_to_move: 'tiger',
          moves: ['a2'],
          legal_moves: [],
          position: 'T3T/5/5/G4/T3T t 19 0',
        }),
      );
    });
    await renderRouter('./src/app', { initialUrl: `/game/${g.id}` });
    await screen.findByText('Your move: place a goat (20 in hand).');
    await fireEvent(screen.getByTestId('board'), 'layout', {
      nativeEvent: { layout: { width: 320 } },
    });
    await fireEvent.press(screen.getByTestId('point-a2'));
    await screen.findByText('Waiting for bob…');
    expect(screen.getByText('1. a2')).toBeTruthy(); // the move list

    // The opponent's reply arrives over the WebSocket.
    const reply = game({
      ply: 2,
      moves: ['a2', 'a1-b1'],
      position: 'T3T/5/5/G4/1T2T g 19 0',
      legal_moves: ['c3'],
    });
    await act(async () =>
      mockSockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'game', game: reply }) }),
    );
    await screen.findByText('Your move: place a goat (19 in hand).');
  });

  it('refuses games the player is not in', async () => {
    mockRoutes.set('GET /api/v1/me', json(200, ME));
    mockRoutes.set(
      'GET /api/v1/games/nope',
      json(403, { error: { code: 'not_a_player', message: 'm' } }),
    );
    await renderRouter('./src/app', { initialUrl: '/game/nope' });
    await screen.findByText('This game is not available.');
  });
});

describe('accounts', () => {
  const TOKEN = 'x'.repeat(43);

  it('signs up with early hints and server field errors', async () => {
    mockRoutes.set('GET /api/v1/me', signedOut);
    let attempt = 0;
    mockRoutes.set('POST /api/v1/auth/register', () =>
      ++attempt === 1
        ? respond(409, { error: { code: 'username_taken', message: 'That username is taken.' } })
        : respond(202, { status: 'accepted' }),
    );
    await renderRouter('./src/app', { initialUrl: '/sign-up' });
    await fireEvent.changeText(await screen.findByLabelText('Username'), '-x');
    expect(screen.getByText(/3–20 letters/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Username'), 'carol');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'carol@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    expect(screen.getByText('At least 10 characters.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long enough password');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('That username is taken.');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your email');
  });

  it('verifies an email once and signs in', async () => {
    mockRoutes.set('GET /api/v1/me', signedOut);
    mockRoutes.set('POST /api/v1/auth/verify-email', () =>
      respond(200, { user: ME, token: 'tok' }),
    );
    lobbyRoutes();
    await renderRouter('./src/app', { initialUrl: `/verify-email?token=${TOKEN}` });
    await screen.findByText('Your email is verified and you are signed in.');
    expect(mockCalls.filter((c) => c.endsWith('verify-email'))).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Start playing' }));
    await screen.findByText('Online now');
  });

  it('explains a broken or expired link', async () => {
    mockRoutes.set('GET /api/v1/me', signedOut);
    await renderRouter('./src/app', { initialUrl: '/verify-email?token=short' });
    await screen.findByText(/This link is incomplete/);
    mockRoutes.set('POST /api/v1/auth/verify-email', () =>
      respond(400, {
        error: { code: 'invalid_token', message: 'This link is invalid or has expired.' },
      }),
    );
    await renderRouter('./src/app', { initialUrl: `/verify-email?token=${'y'.repeat(43)}` });
    await screen.findByText('This link is invalid or has expired.');
  });

  it('resets a password and requests reset links', async () => {
    mockRoutes.set('GET /api/v1/me', signedOut);
    mockRoutes.set('POST /api/v1/auth/password-reset/confirm', () => respond(204));
    mockRoutes.set('POST /api/v1/auth/password-reset', () => respond(202, { status: 'accepted' }));
    await renderRouter('./src/app', { initialUrl: `/reset-password?token=${TOKEN}` });
    await fireEvent.changeText(
      await screen.findByLabelText('New password'),
      'a brand new password',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText(/signed out everywhere/);

    await renderRouter('./src/app', { initialUrl: '/forgot-password' });
    await fireEvent.changeText(await screen.findByLabelText('Email'), 'alice@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    await screen.findByText(/If alice@example.com belongs to an account/);
  });
});

describe('lobby, profiles and leaderboards', () => {
  beforeEach(() => {
    mockRoutes.set('GET /api/v1/me', json(200, ME));
    lobbyRoutes();
  });

  it('challenges a player from their profile', async () => {
    const profile = {
      ...BOB,
      online: true,
      playing: false,
      created_at: '2026-10-01T00:00:00Z',
      ratings: { blitz: { rating: 1620, deviation: 80, games: 30, provisional: false, rank: 3 } },
    };
    mockRoutes.set('GET /api/v1/players/bob', json(200, profile));
    let sent: unknown;
    mockRoutes.set('POST /api/v1/challenges', (body) => {
      sent = body;
      return respond(201, challengeFixture());
    });
    await renderRouter('./src/app', { initialUrl: '/player/bob' });
    await screen.findByText('1620');
    expect(screen.getByText('30 games · #3')).toBeTruthy();
    expect(screen.getByText('1500?')).toBeTruthy(); // no rapid rating yet
    await fireEvent.press(screen.getByRole('radio', { name: '10+5 rapid' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Challenge bob' }));
    await screen.findByText(/Challenge sent to bob/);
    expect(sent).toEqual({ opponent: 'bob', time_control: '10+5', rated: true });
  });

  it('explains busy players and unknown names', async () => {
    mockRoutes.set(
      'GET /api/v1/players/bob',
      json(200, {
        ...BOB,
        online: true,
        playing: true,
        created_at: '2026-10-01T00:00:00Z',
        ratings: {},
      }),
    );
    mockRoutes.set(
      'POST /api/v1/challenges',
      json(409, {
        error: { code: 'player_busy', message: 'One of you is already playing a game.' },
      }),
    );
    await renderRouter('./src/app', { initialUrl: '/player/bob' });
    await fireEvent(await screen.findByRole('switch', { name: 'Rated' }), 'valueChange', false);
    await fireEvent.press(screen.getByRole('radio', { name: '🐯 Tigers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Challenge bob' }));
    await screen.findByText('One of you is already playing a game.');

    mockRoutes.set(
      'GET /api/v1/players/zed',
      json(404, { error: { code: 'player_not_found', message: 'No such player.' } }),
    );
    await renderRouter('./src/app', { initialUrl: '/player/zed' });
    await screen.findByText('There is no player called zed.');
  });

  it('shows leaderboards by time control', async () => {
    mockRoutes.set(
      'GET /api/v1/leaderboards/blitz',
      json(200, [{ rank: 1, player: BOB, rating: 1700, games: 40 }]),
    );
    mockRoutes.set('GET /api/v1/leaderboards/rapid', json(200, []));
    await renderRouter('./src/app', { initialUrl: '/leaderboard' });
    await screen.findByLabelText('Rank 1, bob, rating 1700');
    await fireEvent.press(screen.getByRole('tab', { name: 'Rapid' }));
    await screen.findByText(/Nobody is ranked yet/);
  });

  it('lists challenges and resumes a live game', async () => {
    const incoming = challengeFixture({
      challenger: BOB,
      opponent: ALICE,
      expires_at: new Date(Date.now() + 45_000).toISOString(),
    });
    mockRoutes.set('GET /api/v1/challenges', json(200, { incoming: [incoming], outgoing: [] }));
    mockRoutes.set('GET /api/v1/games', json(200, [game()]));
    await renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByText(/bob challenges you/);
    expect(screen.getByText(/Your game against bob/)).toBeTruthy();
  });

  it('searches players by name', async () => {
    mockRoutes.set('GET /api/v1/players', json(200, [{ ...BOB, online: false, playing: false }]));
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByLabelText('Username'), 'bo');
    await screen.findByLabelText('bob, offline');
  });

  it('signs out from the Me tab', async () => {
    mockRoutes.set(
      'GET /api/v1/players/alice',
      json(200, {
        ...ALICE,
        online: true,
        playing: false,
        created_at: '2026-10-01T00:00:00Z',
        ratings: {},
      }),
    );
    mockRoutes.set('POST /api/v1/auth/logout', json(204));
    await renderRouter('./src/app', { initialUrl: '/me' });
    await screen.findByText('Signed in as alice@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Sign in' });
  });
});

describe('game controls', () => {
  beforeEach(() => mockRoutes.set('GET /api/v1/me', json(200, ME)));

  it('resigns only after confirming', async () => {
    const g = game({ ply: 4, moves: ['a2', 'a1-b1', 'c3', 'e1-d1'] });
    mockRoutes.set(`GET /api/v1/games/${g.id}`, json(200, g));
    mockRoutes.set(
      `POST /api/v1/games/${g.id}/resign`,
      json(
        200,
        game({ ...g, status: 'finished', result: { winner: 'tiger', reason: 'resigned' } }),
      ),
    );
    await renderRouter('./src/app', { initialUrl: `/game/${g.id}` });
    await fireEvent.press(await screen.findByRole('button', { name: 'Resign' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep playing' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm resign' }));
    await screen.findByText('bob won. alice resigned.');
    expect(screen.getByRole('button', { name: 'Back to lobby' })).toBeTruthy();
  });

  it('aborts before both sides have moved, and shows rated matches', async () => {
    const g = game({
      rated: true,
      match: {
        id: 'm',
        game: 1,
        games: ['g0000000-0000-0000-0000-000000000001'],
        score: [
          { player: ALICE, points: 0 },
          { player: BOB, points: 0 },
        ],
      },
    });
    mockRoutes.set(`GET /api/v1/games/${g.id}`, json(200, g));
    mockRoutes.set(
      `POST /api/v1/games/${g.id}/abort`,
      json(
        200,
        game({ ...g, status: 'finished', result: { winner: null, reason: 'aborted' as never } }),
      ),
    );
    await renderRouter('./src/app', { initialUrl: `/game/${g.id}` });
    await screen.findByText(/Rated match, game 1 of 2 · alice 0 – bob 0/);
    await fireEvent.press(screen.getByRole('button', { name: 'Abort' }));
    await screen.findByText('Game aborted: no result.');
  });

  it('offers the abandonment claim when the opponent has gone', async () => {
    const g = game({
      ply: 3,
      side_to_move: 'tiger',
      moves: ['a2', 'a1-b1', 'c3'],
      position: 'T3T/5/2G2/G4/1T2T t 18 0',
    });
    mockRoutes.set(`GET /api/v1/games/${g.id}`, json(200, g));
    mockRoutes.set(
      'GET /api/v1/players/bob',
      json(200, {
        ...BOB,
        online: false,
        playing: true,
        created_at: '2026-10-01T00:00:00Z',
        ratings: {},
      }),
    );
    mockRoutes.set(
      `POST /api/v1/games/${g.id}/claim-abandonment`,
      json(409, {
        error: {
          code: 'cannot_claim',
          message: 'Your opponent has not been away for 60 seconds yet.',
        },
      }),
    );
    await renderRouter('./src/app', { initialUrl: `/game/${g.id}` });
    await fireEvent.press(await screen.findByRole('button', { name: 'Claim win' }));
    await screen.findByText('Your opponent has not been away for 60 seconds yet.');
  });
});

it('maps errors for the screens', () => {
  expect(new ApiError(409, 'x', 'y').fieldProblem('z')).toBeUndefined();
});

afterAll(async () => {
  await waitFor(() => undefined);
});
