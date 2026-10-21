import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { GameSummary } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { DAILY, game } from './support/games';
import { PLANS } from './support/plans';

const DAILY_URL = '/api/v1/trainer/daily';

function home(routes: Record<string, Route> = {}) {
  return renderApp('/', {
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
    const { server } = await home({
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
    expect(await screen.findByText('Not quite. The best move was c3.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/trainer/o006/answer').body).toEqual({ move: 'a2' });
    expect(screen.getByText('A new puzzle comes tomorrow.')).toBeOnTheScreen();
    // Answered, the board folds away; it can be looked at again.
    expect(screen.queryByText('Goats to play: find the best move.')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: "Today's position", expanded: false }),
    );
    expect(
      screen.getByRole('button', { name: "Today's position", expanded: true }),
    ).toBeOnTheScreen();
    // The trainer's own screen says what it is and which plan has it (one upsell).
    expect(screen.getByRole('button', { name: 'More puzzles in the trainer' })).toBeOnTheScreen();
  });

  test('Pro players go on to the trainer; a failed puzzle can be tried again', async () => {
    let fail = true;
    const pro = {
      plan: 'pro' as const,
      plan_until: null,
      features: PLANS[2]!.features,
      grants: [],
    };
    const { app } = await home({
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

  test('my latest results, and the way to the rest', async () => {
    const { app } = await home({
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

  test('a live game comes first, to continue', async () => {
    await home({
      'GET /api/v1/games': {
        status: 200,
        body: [game({ server_time: new Date().toISOString() })],
      },
    });
    expect(await screen.findByText('Continue your game')).toBeOnTheScreen();
    expect(screen.queryByText('Ready for a game?')).toBeNull();
  });

  test('more ways to play, with the plan a locked one needs; a streak to keep', async () => {
    const { app } = await home({
      [`GET ${DAILY_URL}`]: { status: 200, body: { ...DAILY, streak: 3 } },
    });
    expect(await screen.findByText('Daily streak: 3 days')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Trainer' })).toHaveTextContent(/PRO/);
    expect(screen.getByRole('link', { name: 'Tournaments' })).not.toHaveTextContent(/PRO/);
    await fireEvent.press(screen.getByRole('link', { name: 'Tournaments' }));
    await waitFor(() => expect(app.getPathname()).toBe('/tournaments'));
  });

  test('guests are not offered challenges', async () => {
    await home({
      'GET /api/v1/me': { status: 200, body: { ...ME, username: 'guest-3fa9c1', role: 'guest' } },
    });
    expect(await screen.findByRole('link', { name: 'Tournaments' })).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: 'Challenge a friend by link' })).toBeNull();
    expect(
      await screen.findByText(/^Nobody else is online right now\. Play now finds you/),
    ).toBeOnTheScreen();
  });
});
