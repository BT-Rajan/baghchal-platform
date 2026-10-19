import { screen } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';
import { BOB } from './support/games';

test("a profile shows the player's achievements, earned ones first", async () => {
  await renderApp('/player/bob', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/players/bob': {
        status: 200,
        body: {
          ...BOB,
          online: true,
          playing: false,
          blocked: false,
          created_at: ME.created_at,
          ratings: {},
        },
      },
      'GET /api/v1/players/bob/achievements': {
        status: 200,
        body: [
          { key: 'beat_hard', earned_at: null },
          { key: 'first_win', earned_at: '2026-10-03T12:00:00Z' },
        ],
      },
    },
  });
  expect(await screen.findByText('1 of 2 earned')).toBeOnTheScreen();
  expect(screen.getByLabelText('First win: Win a game. Earned 3 Oct 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText('Master: Beat the Hard computer. Not yet earned')).toBeOnTheScreen();
});
