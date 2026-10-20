import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { FREE_APPEARANCE } from '@/appearance/catalog';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';

const LOOK = '/api/v1/me/appearance';

function open(me = ME, routes = {}) {
  return renderApp('/make-it-yours', {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: me }, ...routes },
  });
}

describe('make it yours: a new account’s first stop', () => {
  test('offers the boards and pieces, with the plan the others need, then playing', async () => {
    const { server, app } = await open(ME, {
      [`PATCH ${LOOK}`]: { status: 200, body: { ...FREE_APPEARANCE, pieces: 'classic' } },
    });
    expect(await screen.findByRole('radio', { name: 'Wood' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Walnut, comes with Plus' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Classic' }));
    await waitFor(() => expect(server.lastTo(`PATCH ${LOOK}`).body).toEqual({ pieces: 'classic' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start playing' }));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  test('finds friends by name, or by sending a link', async () => {
    const { app } = await open(ME, {
      'GET /api/v1/players': {
        status: 200,
        body: [{ id: 'b', username: 'bob', online: true, playing: false, badge: null }],
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Find friends' }));
    await fireEvent.changeText(screen.getByLabelText('Find a player'), 'bo');
    expect(await screen.findByText('bob')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Challenge a friend by link' }));
    await waitFor(() => expect(app.getPathname()).toBe('/invite'));
  });

  test('a player waiting for a parent sees why friends are not open yet', async () => {
    await open({ ...ME, plays_people: false, parent_consent: 'pending' });
    expect(await screen.findByRole('radio', { name: 'Wood' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Find friends' })).toBeNull();
    expect(screen.getByText(/^A parent or guardian has to agree/)).toBeOnTheScreen();
  });
});
