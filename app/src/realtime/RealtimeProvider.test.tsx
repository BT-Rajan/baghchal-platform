import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { ME, error, fakeServer, type Route } from '../../tests/support/fakeServer';
import { FakeSocket, openFakeSocket } from '../../tests/support/fakeSocket';
import { BOB, game } from '../../tests/support/games';
import { memoryTokenStore } from '../../tests/support/memoryTokenStore';

import type { Game } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { SessionProvider, useSession } from '@/auth/session';

import { RealtimeProvider, useRealtimeStatus } from './RealtimeProvider';

const URL = 'ws://api.example/api/v1/ws';

function Probe() {
  const { state } = useSession();
  return <Text>{`${state.status}/${useRealtimeStatus()}`}</Text>;
}

async function setup({
  os = undefined as string | undefined, // the platform's own (iOS under Jest)
  token = 'tok' as string | null,
  routes = { 'GET /api/v1/me': { status: 200, body: ME } } as Record<string, Route>,
  onGameStarted = jest.fn<void, [Game]>(),
} = {}) {
  const server = fakeServer(routes);
  // No cache garbage collection: its 5-minute timer would keep Jest from exiting.
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const foreground: ((state: string) => void)[] = [];
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    foreground.push(listener as (state: string) => void);
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider
        baseUrl="http://api.example"
        queryClient={queryClient}
        transport="bearer"
        tokenStore={memoryTokenStore(token)}
        fetch={server.fetch}
      >
        <RealtimeProvider
          url={URL}
          {...(os !== undefined && { os })}
          openSocket={openFakeSocket}
          onGameStarted={onGameStarted}
        >
          <Probe />
        </RealtimeProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { server, queryClient, foreground, remove, onGameStarted, view };
}

beforeEach(() => FakeSocket.reset());
afterEach(() => jest.restoreAllMocks());

test('no socket while signed out', async () => {
  await setup({ token: null });
  expect(await screen.findByText('signedOut/stopped')).toBeOnTheScreen();
  expect(FakeSocket.all).toHaveLength(0);
});

test('opens one socket with the session token once signed in', async () => {
  await setup();
  await screen.findByText('signedIn/connecting');
  expect(FakeSocket.all).toHaveLength(1);
  expect(FakeSocket.latest()).toMatchObject({ url: URL, headers: { Authorization: 'Bearer tok' } });
  await act(() => FakeSocket.latest().open());
  expect(screen.getByText('signedIn/open')).toBeOnTheScreen();
});

test('game events fill the cache, and a new game of mine is opened', async () => {
  const { queryClient, onGameStarted } = await setup();
  await screen.findByText('signedIn/connecting');
  const socket = FakeSocket.latest();
  await act(() => {
    socket.open();
    socket.receive({ type: 'game', game: game() });
    socket.receive({ type: 'game', game: game({ ply: 1 }) });
  });
  expect(queryClient.getQueryData<Game>(queryKeys.game('g1'))?.ply).toBe(1);
  expect(onGameStarted).toHaveBeenCalledTimes(1);
  expect(onGameStarted).toHaveBeenCalledWith(game());
});

test('a reconnect refetches what may have been missed', async () => {
  const { queryClient } = await setup();
  await screen.findByText('signedIn/connecting');
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  jest.useFakeTimers();
  try {
    await act(() => {
      FakeSocket.latest().open();
      FakeSocket.latest().serverClose(1006);
    });
    expect(screen.getByText('signedIn/waiting')).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTime(30_000));
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => FakeSocket.latest().open());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.challenges });
  } finally {
    jest.useRealTimers();
  }
});

test('coming back to the foreground reconnects at once', async () => {
  const { foreground } = await setup();
  await screen.findByText('signedIn/connecting');
  await act(() => FakeSocket.latest().serverClose(1006)); // refused: it checks /me, then waits
  expect(screen.getByText('signedIn/waiting')).toBeOnTheScreen();
  await act(() => foreground.forEach((listener) => listener('background')));
  expect(FakeSocket.all).toHaveLength(1);
  await act(() => foreground.forEach((listener) => listener('active')));
  expect(FakeSocket.all).toHaveLength(2);
});

test('apps let go of the connection in the background and reconnect when back', async () => {
  const { foreground, queryClient } = await setup();
  await screen.findByText('signedIn/connecting');
  await act(() => FakeSocket.latest().open());
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  await act(() => foreground.forEach((listener) => listener('inactive'))); // a brief overlay
  expect(screen.getByText('signedIn/open')).toBeOnTheScreen();
  await act(() => foreground.forEach((listener) => listener('background')));
  expect(screen.getByText('signedIn/paused')).toBeOnTheScreen();
  expect(FakeSocket.all[0]?.closed).toBe(true);
  await act(() => foreground.forEach((listener) => listener('active')));
  await act(() => FakeSocket.latest().open());
  expect(FakeSocket.all).toHaveLength(2);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.challenges });
});

test('browsers keep the connection in a background tab', async () => {
  const { foreground } = await setup({ os: 'web' });
  await screen.findByText('signedIn/connecting');
  await act(() => FakeSocket.latest().open());
  await act(() => foreground.forEach((listener) => listener('background')));
  expect(screen.getByText('signedIn/open')).toBeOnTheScreen();
  expect(FakeSocket.latest().closed).toBe(false);
});

test('a refused handshake checks the session, which may have ended', async () => {
  const { server } = await setup();
  await screen.findByText('signedIn/connecting');
  server.on('GET /api/v1/me', error(401, 'not_authenticated'));
  await act(() => FakeSocket.latest().serverClose(1006));
  expect(await screen.findByText('signedOut/stopped')).toBeOnTheScreen();
});

test('a refused handshake with the server down just waits', async () => {
  const { server } = await setup();
  await screen.findByText('signedIn/connecting');
  server.on('GET /api/v1/me', error(503, 'unavailable'));
  await act(() => FakeSocket.latest().serverClose(1006));
  await waitFor(() => expect(server.requests).toHaveLength(2));
  expect(screen.getByText('signedIn/waiting')).toBeOnTheScreen();
});

test('close code 4401 signs out', async () => {
  const { remove } = await setup();
  await screen.findByText('signedIn/connecting');
  const socket = FakeSocket.latest();
  await act(() => {
    socket.open();
    socket.serverClose(4401);
  });
  expect(await screen.findByText('signedOut/stopped')).toBeOnTheScreen();
  expect(remove).toHaveBeenCalled();
});

test('hello for another user (another tab signed in) checks the session again', async () => {
  const { server } = await setup();
  await screen.findByText('signedIn/connecting');
  server.on('GET /api/v1/me', { status: 200, body: { ...ME, ...BOB } });
  await act(() => {
    FakeSocket.latest().open();
    FakeSocket.latest().receive({ type: 'hello', user: BOB });
  });
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  expect(FakeSocket.all[0]?.closed).toBe(true);
});

test('the status is "stopped" outside the provider', async () => {
  function Bare() {
    return <Text>{useRealtimeStatus()}</Text>;
  }
  await render(<Bare />);
  expect(screen.getByText('stopped')).toBeOnTheScreen();
});
