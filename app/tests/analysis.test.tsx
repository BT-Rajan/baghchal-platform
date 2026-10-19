import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Analysis } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { game } from './support/games';
import { PLUS_UNTIL } from './support/plans';

const URL = '/api/v1/games/g1/analysis';
const POSITIONS = ['T3T/5/5/5/T3T g 20 0', 'T3T/5/5/G4/T3T t 19 0', 'T3T/5/5/G4/1T2T g 19 0'];
const FINISHED = game({
  status: 'finished',
  result: { winner: 'tiger', reason: 'resigned' },
  ply: 2,
  moves: ['a2', 'a1-b1'],
  position: POSITIONS[2]!,
  positions: POSITIONS,
  legal_moves: [],
  side_to_move: 'goat',
  server_time: new Date().toISOString(),
});
const ANALYSIS: Analysis = {
  game_id: 'g1',
  created_at: '2026-01-01T12:00:00Z',
  left_today: 4,
  moves: [
    { ply: 1, side: 'goat', move: 'a2', best: 'b2', loss: 900, verdict: 'blunder', score: 0 },
    { ply: 2, side: 'tiger', move: 'a1-b1', best: 'a1-b1', loss: 0, verdict: 'best', score: 1200 },
  ],
};
const PLUS = { 'GET /api/v1/me/plan': { status: 200, body: PLUS_UNTIL } };

function open(routes: Record<string, Route> = {}) {
  return renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/games/g1': { status: 200, body: FINISHED },
      ...routes,
    },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

describe('game analysis', () => {
  test('Free players see what Plus adds', async () => {
    const { app, server } = await open();
    expect(
      await screen.findByText('See the engine’s review of every move, and where the game turned.'),
    ).toBeOnTheScreen();
    expect(server.requests.some((r) => r.path === URL)).toBe(false);
    await press('Get ClawPlay Plus');
    await waitFor(() => expect(app.getPathname()).toBe('/plans'));
  });

  test('ask for it, then step through the verdicts', async () => {
    const { server } = await open({
      ...PLUS,
      [`GET ${URL}`]: error(404, 'not_analysed', 'This game has not been analysed yet.'),
      [`POST ${URL}`]: { status: 200, body: ANALYSIS },
    });
    await screen.findByText('Analyse this game');
    await press('Analyse this game');
    expect(await screen.findByText('Best move')).toBeOnTheScreen();
    expect(server.lastTo(`POST ${URL}`)).toBeDefined();
    expect(screen.getByText("Move 2, tigers a1-b1: the engine's choice.")).toBeOnTheScreen();
    expect(screen.getByText('Before the move: Tigers ahead (+1.2)')).toBeOnTheScreen();
    expect(screen.getByText('Goats (alice): 1 blunder')).toBeOnTheScreen();
    expect(screen.getByText('Tigers (bob): 1 best')).toBeOnTheScreen();
    expect(screen.getByText('4 analyses of new games left today.')).toBeOnTheScreen();
    expect(screen.getByText(/a2\?\?\s+a1-b1/)).toBeOnTheScreen();

    await press('Start position');
    expect(
      screen.getByText('Step through the moves to see what the engine thought of each.'),
    ).toBeOnTheScreen();
    await press('Next mistake');
    expect(screen.getByText('Blunder')).toBeOnTheScreen();
    expect(
      screen.getByText("Move 1, goats a2: blunder. The engine's choice was b2."),
    ).toBeOnTheScreen();
    expect(screen.getByText('Before the move: About even')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next mistake' })).toBeDisabled();
  });

  test('an analysis already made is shown at once', async () => {
    const { server } = await open({
      ...PLUS,
      [`GET ${URL}`]: { status: 200, body: { ...ANALYSIS, left_today: null } },
    });
    expect(await screen.findByText('Best move')).toBeOnTheScreen();
    expect(screen.queryByText(/left today/)).toBeNull();
    expect(server.requests.some((r) => r.method === 'POST' && r.path === URL)).toBe(false);
  });

  test('a refusal and a failed load are shown', async () => {
    let fail = true;
    await open({
      ...PLUS,
      [`GET ${URL}`]: () =>
        fail
          ? error(400, 'bad', 'Analysis is down.')
          : error(404, 'not_analysed', 'This game has not been analysed yet.'),
      [`POST ${URL}`]: error(429, 'analysis_limit', 'You have used today’s analyses.'),
    });
    expect(await screen.findByText('Analysis is down.')).toBeOnTheScreen();
    fail = false;
    await press('Try again');
    await screen.findByText('Analyse this game');
    await press('Analyse this game');
    expect(await screen.findByText('You have used today’s analyses.')).toBeOnTheScreen();
  });
});
