import * as ReactNative from 'react-native';

import { render } from '@testing-library/react-native';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { ErrorBoundary } from '@/app/_layout';

import { renderApp } from './support/app';
import { ME, error } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { game } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };

test('a banner says when live updates are interrupted', async () => {
  await renderApp('/', { token: 'tok', routes: SIGNED_IN });
  await screen.findByRole('heading', { name: 'Play' });
  expect(screen.queryByText(/Reconnecting/)).toBeNull();
  await act(() => {
    FakeSocket.latest().open();
    FakeSocket.latest().serverClose(1006);
  });
  expect(screen.getByText('Reconnecting… Live updates are paused.')).toBeOnTheScreen();
});

test('failed lists can be tried again', async () => {
  let fail = true;
  await renderApp('/', {
    token: 'tok',
    routes: {
      ...SIGNED_IN,
      'GET /api/v1/challenges': () =>
        fail
          ? error(400, 'oops', 'Could not load challenges.')
          : { status: 200, body: { incoming: [], outgoing: [] } },
    },
  });
  expect(await screen.findByText('Could not load challenges.')).toBeOnTheScreen();
  fail = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/wait here to be challenged/)).toBeOnTheScreen();
  expect(screen.queryByText('Could not load challenges.')).toBeNull();
});

test('a quiet lobby says what to do', async () => {
  await renderApp('/', { token: 'tok', routes: SIGNED_IN });
  expect(
    await screen.findByText(/^Play now pairs you with anyone who wants the same game/),
  ).toBeOnTheScreen();
});

test('when I am the only one online, the list says so', async () => {
  await renderApp('/', {
    token: 'tok',
    routes: {
      ...SIGNED_IN,
      'GET /api/v1/players/online': {
        status: 200,
        body: [{ id: ME.id, username: ME.username, online: true, playing: false }],
      },
    },
  });
  expect(await screen.findByText('You')).toBeOnTheScreen();
  expect(screen.getByText('Nobody else is online right now.')).toBeOnTheScreen();
});

test('on wide screens the lobby has two columns', async () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 1280,
    height: 800,
    scale: 1,
    fontScale: 1,
  });
  await renderApp('/', { token: 'tok', routes: SIGNED_IN });
  expect(await screen.findByText('Online now')).toBeOnTheScreen();
  jest.restoreAllMocks();
});

test('an unknown address shows a page-not-found screen', async () => {
  await renderApp('/no/such/page', { token: 'tok', routes: SIGNED_IN });
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeOnTheScreen();
  expect(screen.getByText('Go to the lobby')).toBeOnTheScreen();
});

test('a crashed screen offers to try again', async () => {
  const retry = jest.fn(async () => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await render(<ErrorBoundary error={new Error('boom')} retry={retry} />);
  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalled();
  jest.restoreAllMocks();
});

test('screen readers hear the last move with whose turn it is', async () => {
  const g = game({
    ply: 2,
    moves: ['c3', 'a1-b1'],
    position: 'T3T/5/2G2/5/1T2T g 19 0',
    server_time: new Date().toISOString(),
  });
  await renderApp('/game/g1', {
    token: 'tok',
    routes: { ...SIGNED_IN, 'GET /api/v1/games/g1': { status: 200, body: g } },
  });
  expect(await screen.findByLabelText('bob moved a1 to b1. Your move')).toBeOnTheScreen();
});

test('on a phone held sideways, the player bars move beside the board', async () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 844,
    height: 390,
    scale: 3,
    fontScale: 1,
  });
  await renderApp('/game/g1', {
    token: 'tok',
    routes: {
      ...SIGNED_IN,
      'GET /api/v1/games/g1': {
        status: 200,
        body: game({ server_time: new Date().toISOString() }),
      },
    },
  });
  expect(await screen.findByText('alice (you)')).toBeOnTheScreen();
  expect(screen.getByLabelText('Board')).toBeOnTheScreen();
  jest.restoreAllMocks();
});
