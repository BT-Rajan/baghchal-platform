import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import type { GameSummary } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { DAILY, game } from './support/games';
import { PLANS } from './support/plans';

const DAILY_URL = '/api/v1/trainer/daily';

/** The web's home, which keeps everything on the page. */
function webHome(routes: Record<string, Route> = {}) {
  jest.replaceProperty(Platform, 'OS', 'web');
  return home(routes);
}

/** Today's puzzle on its own screen (the apps' play menu). */
const puzzle = (routes: Record<string, Route> = {}) => home(routes, '/puzzle');

afterEach(() => jest.restoreAllMocks());

function home(routes: Record<string, Route> = {}, url = '/') {
  return renderApp(url, {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: ME }, ...routes },
  });
}

const summary = (i: number, outcome: GameSummary['outcome']): GameSummary => ({
  id: `h${i}`,
  opponent: { id: 'b', username: 'bob' },
  side: 'goat',
  time_control: '5+3',
  rated: false,
  computer: null,
  result: { winner: 'goat', reason: 'resigned' },
  outcome,
  rating_change: null,
  moves: 10,
  finished_at: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
});

describe('home', () => {
  test("solve today's puzzle; the trainer is what Pro adds", async () => {
    let answered = false;
    const { server } = await puzzle({
      [`GET ${DAILY_URL}`]: () => ({
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
    expect(await screen.findByText('Goats to play: find the best move.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^a2, empty, move here/ }));
    expect(
      await screen.findByText('Not quite. The best move was c3, shown on the board.'),
    ).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/trainer/o006/answer').body).toEqual({ move: 'a2' });
    expect(screen.getByText('A new puzzle comes tomorrow.')).toBeOnTheScreen();
    // Just answered, the board stays, to show the best move.
    expect(screen.getByText('Goats to play: find the best move.')).toBeOnTheScreen();
    // The trainer's own screen says what it is and which plan has it (one upsell).
    expect(screen.getByRole('button', { name: 'More puzzles in the trainer' })).toBeOnTheScreen();
  });

  test("on the web's home a puzzle answered earlier folds away; it can be looked at again", async () => {
    await webHome({
      [`GET ${DAILY_URL}`]: {
        status: 200,
        body: { ...DAILY, answer: { move: 'a2', correct: false, best: 'c3' } },
      },
    });
    expect(
      await screen.findByText('Not quite. The best move was c3, shown on the board.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Goats to play: find the best move.')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: "Today's position", expanded: false }),
    );
    expect(
      screen.getByRole('button', { name: "Today's position", expanded: true }),
    ).toBeOnTheScreen();
  });

  test('Pro players go on to the trainer; a failed puzzle can be tried again', async () => {
    let fail = true;
    const pro = {
      plan: 'pro' as const,
      plan_until: null,
      features: PLANS[2]!.features,
      grants: [],
    };
    const { app } = await puzzle({
      'GET /api/v1/me/plan': { status: 200, body: pro },
      [`GET ${DAILY_URL}`]: () =>
        fail ? error(400, 'bad', 'Puzzles are down.') : { status: 200, body: DAILY },
    });
    expect(await screen.findByText('Puzzles are down.')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await fireEvent.press(
      await screen.findByRole('button', { name: 'More puzzles in the trainer' }),
    );
    await waitFor(() => expect(app.getPathname()).toBe('/trainer'));
  });

  test("the web's home: my latest results, and the way to the rest", async () => {
    const { app } = await webHome({
      'GET /api/v1/players/alice/games': {
        status: 200,
        body: [summary(0, 'won'), summary(1, 'lost'), summary(2, 'aborted'), summary(3, 'won')],
      },
    });
    expect(await screen.findByText(/^Won · vs bob/)).toBeOnTheScreen();
    expect(screen.getAllByRole('link', { name: /^Replay:/ })).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'See all your games' }));
    await waitFor(() => expect(app.getPathname()).toBe('/me'));
  });

  test('in the apps, home is two big buttons: Play now and Settings', async () => {
    const { app } = await home();
    expect(await screen.findByRole('button', { name: 'Play now' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.queryByText('Daily puzzle')).toBeNull();
    expect(screen.queryByText('Online now')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(app.getPathname()).toBe('/settings'));
  });

  test('a live game comes first, to resume', async () => {
    await home({
      'GET /api/v1/games': {
        status: 200,
        body: [game({ server_time: new Date().toISOString() })],
      },
    });
    expect(await screen.findByText('Your game against bob')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeOnTheScreen();
  });

  test('Play now opens every way to play, with the plan a locked one needs', async () => {
    const { app } = await home();
    await fireEvent.press(await screen.findByRole('button', { name: 'Play now' }));
    await waitFor(() => expect(app.getPathname()).toBe('/ways-to-play'));
    for (const row of ['Quick game', 'Play the computer', 'Challenge a friend', 'Friends']) {
      expect(await screen.findByRole('link', { name: row })).toBeOnTheScreen();
    }
    expect(await screen.findByRole('link', { name: 'Trainer' })).toHaveTextContent(/PRO/);
    expect(screen.getByRole('link', { name: 'Tournaments' })).not.toHaveTextContent(/PRO/);
    await fireEvent.press(screen.getByRole('link', { name: 'Tournaments' }));
    await waitFor(() => expect(app.getPathname()).toBe('/tournaments'));
  });

  test('a quick game, or the computer, each on its own', async () => {
    const { app } = await home({}, '/ways-to-play');
    await fireEvent.press(await screen.findByRole('link', { name: 'Play the computer' }));
    await waitFor(() => expect(app.getPathname()).toBe('/play'));
    expect(await screen.findByRole('button', { name: 'Play the computer' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Find an opponent' })).toBeNull();
  });

  test('the streak to keep, on the puzzle screen', async () => {
    await puzzle({ [`GET ${DAILY_URL}`]: { status: 200, body: { ...DAILY, streak: 3 } } });
    expect(await screen.findByText('Daily streak: 3 days')).toBeOnTheScreen();
  });

  test('guests are not offered challenges', async () => {
    await home(
      {
        'GET /api/v1/me': {
          status: 200,
          body: { ...ME, username: 'guest-3fa9c1', role: 'guest' },
        },
      },
      '/ways-to-play',
    );
    expect(await screen.findByRole('link', { name: 'Tournaments' })).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: 'Challenge a friend' })).toBeNull();
  });

  test('friends and players to find, from the menu', async () => {
    await home({}, '/friends');
    expect(await screen.findByText('Nobody else is online now.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Find a player')).toBeOnTheScreen();
  });
});
