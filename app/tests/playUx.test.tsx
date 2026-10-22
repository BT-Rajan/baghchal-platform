/** Play, the leaderboard, games, challenges, tournaments and puzzles: how they read and answer. */
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Game, Pairing, Tournament } from '@/api/endpoints';
import { colors } from '@/theme';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, DAILY, challenge, game } from './support/games';

const ALICE = { id: ME.id, username: ME.username };
const CAROL = { id: '00000000-0000-4000-8000-0000000000c0', username: 'carol' };
const now = () => new Date().toISOString();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const fresh = (s: number) => ({ created_at: inSeconds(0), expires_at: inSeconds(s) });

function open(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: ME }, ...routes },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

/** Whether `first` is drawn before `second` on the screen. */
function before(first: string, second: string): boolean {
  // (Play's pull-to-refresh, underneath, holds an element that cannot be written out.)
  const tree = JSON.stringify(screen.toJSON(), (key, value: unknown) =>
    key === 'refreshControl' ? undefined : value,
  );
  const a = tree.indexOf(first);
  const b = tree.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
}

afterEach(() => jest.restoreAllMocks());

describe('home', () => {
  test('Play now is offered while my games could not be loaded', async () => {
    await open('/', { 'GET /api/v1/games': error(503, 'unavailable', 'Try later.') });
    expect(await screen.findByText('Ready for a game?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play now' })).toHaveStyle({
      backgroundColor: colors.accent,
    });
  });

  test('with a challenge for me, answering it is the main action', async () => {
    await open('/', {
      'GET /api/v1/games': { status: 200, body: [] },
      'GET /api/v1/challenges': {
        status: 200,
        body: { incoming: [challenge({ ...fresh(60) })], outgoing: [] },
      },
    });
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play now' })).toHaveStyle({
      backgroundColor: colors.surface,
    });
  });

  test('a challenge sent by name: back on Play, listed, with a word that it went', async () => {
    let sent = false;
    const mine = challenge({ id: 'c9', challenger: ALICE, opponent: BOB, ...fresh(60) });
    const { app } = await open('/challenge/bob', {
      'GET /api/v1/games': { status: 200, body: [] },
      'GET /api/v1/challenges': () => ({
        status: 200,
        body: { incoming: [], outgoing: sent ? [mine] : [] },
      }),
      'POST /api/v1/challenges': () => {
        sent = true;
        return { status: 201, body: mine };
      },
    });
    await screen.findByRole('heading', { name: 'Challenge bob' });
    await press('Send challenge');
    expect(await screen.findByText('Challenge sent to bob.')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for bob')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });
});

describe('leaderboard', () => {
  const profile = (ratings: Record<string, unknown>) => ({
    status: 200,
    body: {
      ...ALICE,
      online: true,
      playing: false,
      blocked: false,
      created_at: ME.created_at,
      ratings,
    },
  });
  const rating = (games: number, rank: number | null) => ({
    rating: 1500,
    deviation: 200,
    games,
    provisional: rank === null,
    rank,
  });

  test('opens on a time control I have a rating in', async () => {
    const { server } = await open('/leaderboard', {
      'GET /api/v1/players/alice': profile({ rapid: rating(4, null) }),
      'GET /api/v1/leaderboards/blitz': { status: 200, body: [] },
      'GET /api/v1/leaderboards/rapid': { status: 200, body: [] },
    });
    expect(
      await screen.findByText(
        'You are rated 1500. You will be listed after a few more rated games, as long as you have played one in the last 30 days.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(server.requests.some((r) => r.path === '/api/v1/leaderboards/rapid')).toBe(true);
    expect(
      screen.getByText(
        'Nobody yet. Players show after a few rated games, if one was in the last 30 days.',
      ),
    ).toBeOnTheScreen();
  });

  test('medal numbers read on their medals', async () => {
    const carol = { id: 'c', username: 'carol' };
    const dave = { id: 'd', username: 'dave' };
    await open('/leaderboard', {
      'GET /api/v1/players/alice': profile({}),
      'GET /api/v1/leaderboards/blitz': {
        status: 200,
        body: [
          { rank: 1, player: BOB, rating: 1702, games: 40 },
          { rank: 2, player: carol, rating: 1680, games: 12 },
          { rank: 3, player: dave, rating: 1660, games: 9 },
        ],
      },
    });
    expect(await screen.findByText('1')).toHaveStyle({ color: colors.text });
    expect(screen.getByText('2')).toHaveStyle({ color: colors.text });
    expect(screen.getByText('3')).toHaveStyle({ color: colors.surface });
  });
});

describe('play now', () => {
  test('says nothing about who is waiting when that could not be found out', async () => {
    await open('/play', { 'GET /api/v1/seeks': error(503, 'unavailable', 'Try later.') });
    expect(await screen.findByRole('button', { name: 'Find an opponent' })).toBeOnTheScreen();
    expect(screen.queryByText('Nobody is waiting for this game right now.')).toBeNull();
  });

  test('a search that could not be stopped goes on, and says why', async () => {
    await open('/play', {
      'GET /api/v1/seeks': { status: 200, body: [] },
      'POST /api/v1/seeks': {
        status: 200,
        body: { status: 'waiting', game: null, expires_at: inSeconds(120) },
      },
      'DELETE /api/v1/seeks': error(503, 'unavailable', 'Could not stop.'),
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Find an opponent' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop looking' }));
    expect(await screen.findByText('Could not stop.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Stop looking' })).toBeOnTheScreen();
  });
});

describe('a game', () => {
  const UNDER_WAY = {
    ply: 2,
    position: 'T3T/5/2G2/5/1T2T g 19 0',
    moves: ['c3', 'a1-b1'],
    legal_moves: ['a2'],
  };
  const openGame = (g: Game, routes: Record<string, Route> = {}) =>
    open(`/game/${g.id}`, { [`GET /api/v1/games/${g.id}`]: { status: 200, body: g }, ...routes });

  test('the board names its points on its edges', async () => {
    await openGame(game({ server_time: now() }));
    await screen.findByText('Your move');
    for (const label of ['a', 'e', '1', '5']) {
      // On the game's board, not the daily puzzle's on Play underneath.
      const inFront = screen
        .getAllByText(label, { includeHiddenElements: true })
        .filter((element) => {
          for (let node = element.parent; node !== null; node = node.parent) {
            if (node.type === 'RNSScreen' && node.props['aria-hidden'] === true) return false;
          }
          return true;
        });
      expect(inFront).toHaveLength(1);
    }
  });

  test('a draw offered to me comes before the chat; a refused move is said under the board', async () => {
    await openGame(game({ ...UNDER_WAY, draw_offer: 'tiger', server_time: now() }), {
      'GET /api/v1/games/g1/chat': { status: 200, body: { open: true, messages: [] } },
      'POST /api/v1/games/g1/moves': error(429, 'rate_limited', 'Too many attempts.'),
    });
    expect(await screen.findByText('bob offers a draw.')).toBeOnTheScreen();
    await screen.findByText('Chat');
    expect(before('bob offers a draw.', 'Chat')).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'a2, empty, move here' }));
    expect(await screen.findByText('Too many attempts.')).toBeOnTheScreen();
    expect(before('Too many attempts.', 'Your move')).toBe(true);
  });

  test('a position that cannot be read can be loaded again', async () => {
    const { server } = await openGame(game({ position: 'nonsense', server_time: now() }));
    expect(await screen.findByText('This position could not be shown.')).toBeOnTheScreen();
    await press('Try again');
    await waitFor(() =>
      expect(server.requests.filter((r) => r.path === '/api/v1/games/g1').length).toBe(2),
    );
  });

  test('replay buttons are icons, named for screen readers', async () => {
    const positions = ['T3T/5/5/5/T3T g 20 0', 'T3T/5/5/G4/T3T t 19 0', 'T3T/5/5/G4/1T2T g 19 0'];
    await openGame(
      game({
        status: 'finished',
        result: { winner: 'tiger', reason: 'resigned' },
        ply: 2,
        moves: ['a2', 'a1-b1'],
        position: positions[2]!,
        positions,
        legal_moves: [],
        server_time: now(),
      }),
    );
    // (Which way the arrows point is in src/components/Icon.test.tsx.)
    expect(await screen.findByRole('button', { name: 'Previous move' })).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Start position' }));
    expect(await screen.findByText('Start position')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Next move' }));
    expect(await screen.findByText('After move 1 of 2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Final position' }));
    expect(await screen.findByText('After move 2 of 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back to Play' })).toBeOnTheScreen();
  });
});

describe('a challenge by link', () => {
  test('a link just made is shared as the main action', async () => {
    const made = challenge({
      challenger: ALICE,
      opponent: null,
      code: 'abc123',
      ...fresh(86_400),
    });
    await open('/invite', { 'POST /api/v1/challenges': { status: 201, body: made } });
    await screen.findByRole('heading', { name: 'Challenge a friend by link' });
    await press('Make a link');
    expect(await screen.findByRole('button', { name: 'Share the link' })).toHaveStyle({
      backgroundColor: colors.accent,
    });
    expect(screen.getByText('http://localhost:8000/c/abc123')).toHaveStyle({ color: colors.link });
  });
});

describe('a tournament', () => {
  const pairing = (overrides: Partial<Pairing> = {}): Pairing => ({
    id: 'p2',
    round: 2,
    goat: CAROL,
    tiger: ALICE,
    state: 'waiting',
    game_id: null,
    winner: null,
    forfeit: false,
    ...overrides,
  });
  const tournament = (overrides: Partial<Tournament> = {}): Tournament => ({
    code: 'cup1',
    name: 'Friday cup',
    host: BOB,
    time_control: 'sand',
    max_players: 6,
    status: 'open',
    players: [BOB, ALICE],
    round: 0,
    rounds: 0,
    standings: [],
    pairings: [],
    byes: [],
    created_at: '2026-01-01T12:00:00Z',
    ...overrides,
  });

  test('who is in, out of how many; leaving says so', async () => {
    let players = [BOB, ALICE];
    await open('/tournament/cup1', {
      'GET /api/v1/tournaments/cup1': () => ({
        status: 200,
        body: tournament({ players }),
      }),
      'POST /api/v1/tournaments/cup1/leave': () => {
        players = [BOB];
        return { status: 200, body: tournament({ players }) };
      },
    });
    expect(await screen.findByText('2 of 6 players: bob, alice')).toBeOnTheScreen();
    expect(screen.getByText(/^Sand clock · hosted by bob/)).toBeOnTheScreen();
    await press('Leave');
    expect(await screen.findByText('You left the tournament.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Join' })).toBeOnTheScreen();
  });

  test('my game comes before the standings; the ask is not said once the game is on', async () => {
    let state: Pairing['state'] = 'waiting';
    const running = () =>
      tournament({
        status: 'running',
        round: 2,
        rounds: 2,
        players: [ALICE, BOB, CAROL],
        standings: [
          { player: BOB, points: 2, buchholz: 1, played: 1 },
          { player: CAROL, points: 1, buchholz: 0, played: 0 },
          { player: ALICE, points: 0, buchholz: 2, played: 2 },
        ],
        pairings: [pairing({ state, game_id: state === 'playing' ? 'g7' : null })],
      });
    await open('/tournament/cup1', {
      'GET /api/v1/tournaments/cup1': () => ({ status: 200, body: running() }),
      // Accepted at once (the opponent was quick): the pairing is being played.
      'POST /api/v1/tournaments/cup1/pairings/p2/play': () => {
        state = 'playing';
        return { status: 201, body: challenge({ challenger: ALICE, opponent: CAROL }) };
      },
    });
    expect(await screen.findByText('Your game, round 2')).toBeOnTheScreen();
    expect(before('Your game, round 2', 'Standings')).toBe(true);
    expect(screen.getByText("1 game played · opponents' points 1")).toBeOnTheScreen();
    expect(screen.getByText("0 games played · opponents' points 0")).toBeOnTheScreen();
    expect(screen.getByText("2 games played · opponents' points 2")).toBeOnTheScreen();
    await press('Play carol v alice');
    expect(await screen.findByRole('button', { name: 'Open carol v alice' })).toBeOnTheScreen();
    expect(screen.queryByText(/^We asked carol to play/)).toBeNull();
  });
});

describe('puzzles', () => {
  test('the best move is marked from where to where', async () => {
    let answered = false;
    await open('/', {
      'GET /api/v1/trainer/daily': () => ({
        status: 200,
        body: answered ? { ...DAILY, answer: { move: 'a2', correct: false, best: 'c3' } } : DAILY,
      }),
      'POST /api/v1/trainer/o006/answer': () => {
        answered = true;
        return {
          status: 200,
          body: { correct: false, best: 'c3', solved: 0, total: 60, streak: 0 },
        };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: /^a2, empty, move here/ }));
    expect(
      await screen.findByText('Not quite. The best move was c3, shown on the board.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^c3, empty/ })).toHaveStyle({
      borderColor: colors.success,
      borderWidth: 4,
    });
  });
});
