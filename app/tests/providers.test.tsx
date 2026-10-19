import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';
import { AppState, Text } from 'react-native';

import { ApiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { ChallengeList } from '@/api/types';
import { SessionProvider, useMe, useSession } from '@/auth/session';
import { cookieTokenStore, secureTokenStore, type TokenStore } from '@/auth/token-store';
import { createSocket as createNativeSocket } from '@/realtime/create-socket';
import { createSocket as createWebSocket } from '@/realtime/create-socket.web';
import { keys } from '@/realtime/cache';
import { RealtimeProvider, useRealtime } from '@/realtime/provider';
import type { SocketLike } from '@/realtime/socket';

import { ALICE, challenge, game, respond, testQueryClient } from './fixtures';

const ME = { ...ALICE, email: 'alice@example.com', created_at: '2026-10-01T00:00:00Z' };

describe('token stores', () => {
  it('keeps app tokens in secure storage', async () => {
    await secureTokenStore.set('t');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('baghchal.session', 't');
    await expect(secureTokenStore.get()).resolves.toBe('t');
    await secureTokenStore.clear();
    await expect(secureTokenStore.get()).resolves.toBeNull();
  });

  it('stores nothing in browsers', async () => {
    await cookieTokenStore.set('t');
    await expect(cookieTokenStore.get()).resolves.toBeNull();
    await expect(cookieTokenStore.clear()).resolves.toBeUndefined();
  });
});

describe('socket factories', () => {
  const original = globalThis.WebSocket;
  let made: unknown[][] = [];
  beforeEach(() => {
    made = [];
    globalThis.WebSocket = class {
      constructor(...args: unknown[]) {
        made.push(args);
      }
    } as never;
  });
  afterEach(() => {
    globalThis.WebSocket = original;
  });

  it('authenticates app sockets with a bearer header', async () => {
    createNativeSocket('wss://x', 'tok');
    createNativeSocket('wss://x', null);
    expect(made).toEqual([
      ['wss://x', undefined, { headers: { Authorization: 'Bearer tok' } }],
      ['wss://x', undefined, { headers: {} }],
    ]);
  });

  it('lets browsers use their cookie', async () => {
    createWebSocket('wss://x', 'ignored');
    expect(made).toEqual([['wss://x']]);
  });
});

type MemoryStore = {
  token: string | null;
  get: jest.Mock<Promise<string | null>, []>;
  set: jest.Mock<Promise<void>, [string]>;
  clear: jest.Mock<Promise<void>, []>;
};

function memoryStore(token: string | null = null): MemoryStore {
  const store: MemoryStore = {
    token,
    get: jest.fn(async () => store.token),
    set: jest.fn(async (t: string) => {
      store.token = t;
    }),
    clear: jest.fn(async () => {
      store.token = null;
    }),
  };
  return store;
}

function apiWith(...answers: (Response | Error)[]) {
  const fetch = jest.fn(async () => {
    const next = answers.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return next;
  });
  return { api: new ApiClient({ baseUrl: 'https://api.test', transport: 'bearer', fetch }), fetch };
}

const unauthenticated = () => respond(401, { error: { code: 'not_authenticated', message: 'm' } });

describe('SessionProvider', () => {
  function Probe() {
    const { state } = useSession();
    return (
      <Text testID="state">
        {state.status === 'signed-in' ? state.user.username : state.status}
      </Text>
    );
  }

  async function setup(api: ApiClient, store: TokenStore, onSignedOut = jest.fn()) {
    let session!: ReturnType<typeof useSession>;
    function Grab() {
      session = useSession();
      return null;
    }
    const utils = await render(
      <SessionProvider api={api} store={store} onSignedOut={onSignedOut}>
        <Probe />
        <Grab />
      </SessionProvider>,
    );
    return { ...utils, session: () => session, onSignedOut };
  }

  const state = () => screen.getByTestId('state').props.children;

  it('restores a stored session', async () => {
    const { api, fetch } = apiWith(respond(200, ME));
    await setup(api, memoryStore('saved'));
    await waitFor(() => expect(state()).toBe('alice'));
    expect((fetch.mock.calls[0] as never[])[1]).toMatchObject({
      headers: { authorization: 'Bearer saved' },
    });
  });

  it('signs out when the stored session is no longer valid', async () => {
    const { api } = apiWith(unauthenticated());
    const store = memoryStore('stale');
    const { onSignedOut } = await setup(api, store);
    await waitFor(() => expect(state()).toBe('signed-out'));
    expect(store.clear).toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalled();
    expect(api.getToken()).toBeNull();
  });

  it('offers a retry when the server cannot be reached', async () => {
    const { api } = apiWith(new TypeError('offline'), respond(200, ME));
    const { session } = await setup(api, memoryStore());
    await waitFor(() => expect(state()).toBe('unreachable'));
    await act(() => session().retry());
    await waitFor(() => expect(state()).toBe('alice'));
  });

  it('signs in, keeps the token, and signs out even if the server is unreachable', async () => {
    const { api } = apiWith(
      unauthenticated(),
      respond(200, { user: ME, token: 'new' }),
      new TypeError('offline'),
    );
    const store = memoryStore();
    const { session } = await setup(api, store);
    await waitFor(() => expect(state()).toBe('signed-out'));
    await act(() => session().signIn('alice', 'pw'));
    expect(state()).toBe('alice');
    expect(store.token).toBe('new');
    expect(api.getToken()).toBe('new');
    await act(() => session().signOut());
    expect(state()).toBe('signed-out');
    expect(store.token).toBeNull();
  });

  it('verifies an email without a token in browsers', async () => {
    const { api } = apiWith(unauthenticated(), respond(200, { user: ME }));
    const store = memoryStore();
    const { session } = await setup(api, store);
    await waitFor(() => expect(state()).toBe('signed-out'));
    await act(() => session().verifyEmail('x'.repeat(43)));
    expect(state()).toBe('alice');
    expect(store.set).not.toHaveBeenCalled();
  });

  it('notices a session that ends later, and keeps working if clearing storage fails', async () => {
    const { api } = apiWith(respond(200, ME), unauthenticated());
    const store = memoryStore('t');
    store.clear.mockRejectedValueOnce(new Error('keychain locked'));
    await setup(api, store);
    await waitFor(() => expect(state()).toBe('alice'));
    await act(async () => {
      await expect(api.challenges()).rejects.toBeInstanceOf(ApiError);
    });
    expect(state()).toBe('signed-out');
  });

  it.each([
    ['a success', () => respond(200, ME)],
    ['a failure', () => new Response('', { status: 500 })],
  ])('ignores %s that arrives after unmounting', async (_, answer) => {
    let finish!: (r: Response) => void;
    const fetch = jest.fn(() => new Promise<Response>((r) => (finish = r)));
    const api = new ApiClient({ baseUrl: 'https://api.test', transport: 'bearer', fetch });
    const { unmount } = await setup(api, memoryStore());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await unmount();
    await act(async () => finish(answer()));
  });

  it('requires a provider and a signed-in session', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(renderHook(() => useSession())).rejects.toThrow('inside <SessionProvider>');
    const { api } = apiWith(new Error('pending'));
    await expect(
      renderHook(() => useMe(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <SessionProvider api={api} store={memoryStore()}>
            {children}
          </SessionProvider>
        ),
      }),
    ).rejects.toThrow('signed-in session');
    jest.mocked(console.error).mockRestore();
  });

  it('gives the signed-in player to screens', async () => {
    const { api } = apiWith(respond(200, ME));
    function Name() {
      return <Text testID="me">{useMe().email}</Text>;
    }
    function Gate() {
      return useSession().state.status === 'signed-in' ? <Name /> : null;
    }
    await render(
      <SessionProvider api={api} store={memoryStore('t')}>
        <Gate />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('me').props.children).toBe(ME.email));
  });
});

class Sock implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  send = jest.fn();
  close = jest.fn();
  emit(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('RealtimeProvider', () => {
  async function setup(me: string | null = ALICE.id, answers: Response[] = []) {
    const sockets: Sock[] = [];
    const createSocket = jest.fn(() => {
      const s = new Sock();
      sockets.push(s);
      return s;
    });
    const { api, fetch } = apiWith(...answers);
    api.setToken('tok');
    const queryClient = testQueryClient();
    const onGameStarted = jest.fn();
    const onSessionEnded = jest.fn();
    let realtime!: ReturnType<typeof useRealtime>;
    function Grab() {
      realtime = useRealtime();
      return <Text testID="status">{realtime.status}</Text>;
    }
    const listeners: ((s: string) => void)[] = [];
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      listeners.push(listener as never);
      return { remove };
    });
    const utils = await render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider
          api={api}
          me={me}
          createSocket={createSocket}
          onGameStarted={onGameStarted}
          onSessionEnded={onSessionEnded}
        >
          <Grab />
        </RealtimeProvider>
      </QueryClientProvider>,
    );
    return {
      ...utils,
      sockets,
      createSocket,
      queryClient,
      onGameStarted,
      onSessionEnded,
      fetch,
      listeners,
      remove,
      realtime: () => realtime,
    };
  }

  afterEach(() => jest.restoreAllMocks());

  it('connects with the token and feeds events into the cache', async () => {
    const { sockets, createSocket, queryClient, onGameStarted, realtime } = await setup();
    expect(createSocket).toHaveBeenCalledWith('wss://api.test/api/v1/ws', 'tok');
    const s = sockets[0]!;
    await act(() => {
      s.onopen?.({});
      s.emit({ type: 'hello', user: { id: ALICE.id, username: 'alice' } });
    });
    expect(screen.getByTestId('status').props.children).toBe('online');

    queryClient.setQueryData<ChallengeList>(keys.challenges, { incoming: [], outgoing: [] });
    await act(() => s.emit({ type: 'challenge', challenge: challenge() }));
    expect(queryClient.getQueryData<ChallengeList>(keys.challenges)!.outgoing).toHaveLength(1);

    const g = game({ server_time: new Date(Date.now() - 1000).toISOString() });
    await act(() => s.emit({ type: 'game', game: g }));
    expect(onGameStarted).toHaveBeenCalledWith(g.id);
    expect(realtime().clock.offset()).toBeGreaterThanOrEqual(1000);
    await act(() => s.emit({ type: 'game', game: { ...g, ply: 1 } }));
    expect(onGameStarted).toHaveBeenCalledTimes(1);
    await act(() => s.emit({ type: 'pong' }));
  });

  it('refetches after reconnecting and reconnects when the app returns', async () => {
    jest.useFakeTimers();
    try {
      const { sockets, queryClient, listeners } = await setup();
      const hello = { type: 'hello', user: { id: ALICE.id, username: 'alice' } };
      await act(() => sockets[0]!.emit(hello));
      await act(() => sockets[0]!.onclose?.({ code: 1006 }));
      expect(screen.getByTestId('status').props.children).toBe('offline');
      const spy = jest.spyOn(queryClient, 'invalidateQueries');
      await act(() => listeners.forEach((l) => l('background')));
      expect(sockets).toHaveLength(1);
      await act(() => listeners.forEach((l) => l('active')));
      expect(sockets).toHaveLength(2);
      await act(() => sockets[1]!.emit(hello));
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports an ended session and checks the session when refused', async () => {
    const { sockets, onSessionEnded, fetch } = await setup(ALICE.id, [unauthenticated()]);
    jest.useFakeTimers();
    try {
      await act(() => sockets[0]!.onclose?.({ code: 1006 })); // refused before hello
      await act(async () => undefined);
      expect(fetch).toHaveBeenCalledWith('https://api.test/api/v1/me', expect.anything());
      await act(() => jest.advanceTimersByTime(30_000));
      await act(() => sockets[1]!.onclose?.({ code: 4401 }));
      expect(onSessionEnded).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stays offline while signed out and cleans up on unmount', async () => {
    const signedOut = await setup(null);
    expect(signedOut.createSocket).not.toHaveBeenCalled();
    await signedOut.unmount();
    const { sockets, unmount, remove } = await setup();
    await unmount();
    expect(sockets[0]!.close).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it('requires a provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(renderHook(() => useRealtime())).rejects.toThrow('inside <RealtimeProvider>');
  });
});
