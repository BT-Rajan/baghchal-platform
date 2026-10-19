import { screen } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';
import { game } from './support/games';

const CPU = { id: '00000000-0000-4000-8000-0000000000e0', username: 'computer-easy' };

function openGame(served: ReturnType<typeof game>) {
  return renderApp('/game/g1', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/games/g1': { status: 200, body: served },
    },
  });
}

describe('the coach', () => {
  test('marks goats in danger in games against the Easy computer', async () => {
    await openGame(
      game({
        tiger: CPU,
        computer: 'easy',
        position: 'T3T/5/5/G4/4T g 19 0',
        ply: 2,
        moves: ['a2', 'e1-d1'],
        legal_moves: ['b2', 'a3'],
        goats_in_danger: ['a2'],
        server_time: new Date().toISOString(),
      }),
    );
    expect(await screen.findByText('A goat in danger')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^a2, goat, in danger/ })).toBeOnTheScreen();
  });

  test('stays out of other games', async () => {
    await openGame(
      game({
        tiger: { ...CPU, username: 'computer-medium' },
        computer: 'medium',
        goats_in_danger: ['a2'],
        position: 'T3T/5/5/G4/4T g 19 0',
        server_time: new Date().toISOString(),
      }),
    );
    expect(await screen.findByText('Your move')).toBeOnTheScreen();
    expect(screen.queryByText('Tip')).toBeNull();
    expect(screen.queryByRole('button', { name: /in danger/ })).toBeNull();
  });
});
