import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

import { ME, error, fakeServer, type Reply } from '../../tests/support/fakeServer';
import { deferred, memoryTokenStore } from '../../tests/support/memoryTokenStore';

import type { Transport } from '@/api/client';

import { SessionStore } from './sessionStore';

const BOB = { ...ME, id: '00000000-0000-4000-8000-000000000002', username: 'bob' };

function setup({
  transport = 'bearer' as Transport,
  saved = null as string | null,
  username = null as string | null,
  routes = {} as Parameters<typeof fakeServer>[0],
} = {}) {
  const server = fakeServer(routes);
  const tokens = memoryTokenStore(saved);
  const usernames = memoryTokenStore(username);
  const queryClient = new QueryClient();
  const clear = jest.spyOn(queryClient, 'clear');
  const store = new SessionStore({
    baseUrl: 'https://api.example',
    transport,
    tokenStore: tokens,
    usernameStore: usernames,
    queryClient,
    fetch: server.fetch,
  });
  return { server, tokens, usernames, store, clear };
}

describe('restore', () => {
  test('an app with no saved token is signed out without asking the server', async () => {
    const { store, server } = setup();
    expect(store.getState()).toEqual({ status: 'loading' });
    await store.restore();
    expect(store.getState()).toEqual({ status: 'signedOut' });
    expect(server.requests).toHaveLength(0);
  });

  test('an app with a saved token asks the server who it is', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    await store.restore();
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
    expect(server.last().headers.Authorization).toBe('Bearer tok');
    expect(store.token()).toBe('tok');
  });

  test('the web always asks the server (the cookie is invisible to scripts)', async () => {
    const { store, server } = setup({
      transport: 'cookie',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    await store.restore();
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
    expect(server.last().credentials).toBe('include');
  });

  test('an ended session is forgotten', async () => {
    const { store, tokens, clear } = setup({
      saved: 'old',
      routes: { 'GET /api/v1/me': error(401, 'not_authenticated') },
    });
    await store.restore();
    expect(store.getState()).toEqual({ status: 'signedOut' });
    expect(tokens.current()).toBeNull();
    expect(store.token()).toBeNull();
    expect(clear).toHaveBeenCalled();
  });

  test('an unreachable server can be retried', async () => {
    const { store, server } = setup({
      transport: 'cookie',
      routes: { 'GET /api/v1/me': error(503, 'unavailable') },
    });
    await store.restore();
    expect(store.getState()).toMatchObject({ status: 'unreachable', error: { status: 503 } });

    server.on('GET /api/v1/me', { status: 200, body: ME });
    const retried = store.retry();
    expect(store.getState()).toEqual({ status: 'loading' });
    await retried;
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
  });

  test('an unreadable token store counts as no session', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, tokens } = setup({ saved: 'tok' });
    (tokens.load as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    await store.restore();
    expect(store.getState()).toEqual({ status: 'signedOut' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('concurrent calls share one check', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    const first = store.restore();
    expect(store.restore()).toBe(first);
    await first;
    expect(server.requests).toHaveLength(1);
  });

  test('a sign-in during the check wins over its late answer', async () => {
    const reply = deferred<Reply>();
    const { store } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': () => reply.promise,
        'POST /api/v1/auth/login': { status: 200, body: { user: BOB, token: 'bob' } },
      },
    });
    const restoring = store.restore();
    await store.signIn('bob', 'pw');
    reply.resolve({ status: 200, body: ME });
    await restoring;
    expect(store.getState()).toEqual({ status: 'signedIn', user: BOB });
  });

  test('a late failure of the check is ignored too', async () => {
    const reply = deferred<Reply>();
    const { store } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': () => reply.promise,
        'POST /api/v1/auth/login': { status: 200, body: { user: BOB, token: 'bob' } },
      },
    });
    const restoring = store.restore();
    await store.signIn('bob', 'pw');
    reply.resolve(error(503, 'unavailable'));
    await restoring;
    expect(store.getState()).toEqual({ status: 'signedIn', user: BOB });
  });

  test('a sign-in while the token store is read wins too', async () => {
    const { store, tokens, server } = setup({
      routes: { 'POST /api/v1/auth/login': { status: 200, body: { user: BOB, token: 'bob' } } },
    });
    const load = deferred<string | null>();
    (tokens.load as jest.Mock).mockReturnValueOnce(load.promise);
    const restoring = store.restore();
    await store.signIn('bob', 'pw');
    load.resolve(null);
    await restoring;
    expect(store.getState()).toEqual({ status: 'signedIn', user: BOB });
    expect(server.requests).toHaveLength(1);
  });
});

describe('refresh', () => {
  test('reads the user again while signed in', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    await store.restore();
    const changed = { ...ME, email: 'new@example.com' };
    server.on('GET /api/v1/me', { status: 200, body: changed });
    await store.refresh();
    expect(store.getState()).toEqual({ status: 'signedIn', user: changed });
  });

  test('does nothing when signed out', async () => {
    const { store, server } = setup();
    await store.restore();
    await store.refresh();
    expect(server.requests).toEqual([]);
    expect(store.getState()).toEqual({ status: 'signedOut' });
  });

  test('a late answer for an earlier session is ignored', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    await store.restore();
    const answer = deferred<Reply>();
    server.on('GET /api/v1/me', () => answer.promise);
    const refreshing = store.refresh();
    await store.start({ user: BOB, token: 'bob' });
    answer.resolve({ status: 200, body: ME });
    await refreshing;
    expect(store.getState()).toEqual({ status: 'signedIn', user: BOB });
  });
});

describe('terms that changed mid-session', () => {
  const CHANGED = { ...ME, consents_needed: ['terms' as const] };

  test('a request refused for them asks who we are again, so the agreement shows', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'GET /api/v1/games': error(403, 'consents_needed'),
      },
    });
    await store.restore();
    server.on('GET /api/v1/me', { status: 200, body: CHANGED });
    await expect(store.api.activeGames()).rejects.toMatchObject({ code: 'consents_needed' });
    await waitFor(() => expect(store.getState()).toEqual({ status: 'signedIn', user: CHANGED }));
  });

  test('a refresh that fails leaves the session as it was', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'GET /api/v1/games': error(403, 'consents_needed'),
      },
    });
    await store.restore();
    server.on('GET /api/v1/me', error(503, 'unavailable'));
    await expect(store.api.activeGames()).rejects.toMatchObject({ code: 'consents_needed' });
    await waitFor(() => expect(server.requests.at(-1)?.path).toBe('/api/v1/me'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
  });

  test('an answer for an earlier session is ignored', async () => {
    const { store, server } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'GET /api/v1/games': () => error(403, 'consents_needed'),
      },
    });
    await store.restore();
    const answer = deferred<Reply>();
    server.on('GET /api/v1/games', () => answer.promise);
    const games = store.api.activeGames();
    await store.start({ user: BOB, token: 'bob' });
    const before = server.requests.length;
    answer.resolve(error(403, 'consents_needed'));
    await expect(games).rejects.toMatchObject({ code: 'consents_needed' });
    expect(server.requests).toHaveLength(before);
    expect(store.getState()).toEqual({ status: 'signedIn', user: BOB });
  });
});

describe('signing in and out', () => {
  test('signIn trims the login, keeps the token and starts afresh', async () => {
    const { store, server, tokens, clear } = setup({
      routes: { 'POST /api/v1/auth/login': { status: 200, body: { user: ME, token: 'new' } } },
    });
    await store.signIn('  alice ', 'pw');
    expect(server.last().body).toEqual({ login: 'alice', password: 'pw', transport: 'bearer' });
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
    expect(tokens.current()).toBe('new');
    expect(store.token()).toBe('new');
    expect(clear).toHaveBeenCalled();
  });

  test('on the web there is no token to keep', async () => {
    const { store, tokens } = setup({ transport: 'cookie' });
    await store.start({ user: ME });
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
    expect(tokens.save).not.toHaveBeenCalled();
  });

  test('an app session needs a token', async () => {
    const { store } = setup();
    await expect(store.start({ user: ME, token: null })).rejects.toMatchObject({
      code: 'bad_response',
    });
    expect(store.getState()).toEqual({ status: 'loading' });
  });

  test('wrong credentials leave the state alone', async () => {
    const { store } = setup({
      routes: { 'POST /api/v1/auth/login': error(401, 'invalid_credentials') },
    });
    await store.restore();
    await expect(store.signIn('alice', 'bad')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(store.getState()).toEqual({ status: 'signedOut' });
  });

  test('signOut tells the server, then forgets', async () => {
    const { store, server, tokens } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'POST /api/v1/auth/logout': { status: 204 },
      },
    });
    await store.restore();
    await store.signOut();
    expect(server.last()).toMatchObject({ method: 'POST', path: '/api/v1/auth/logout' });
    expect(server.last().headers.Authorization).toBe('Bearer tok');
    expect(store.getState()).toEqual({ status: 'signedOut' });
    expect(tokens.current()).toBeNull();
  });

  test('signOut forgets the session even when the server cannot be told', async () => {
    const { store } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'POST /api/v1/auth/logout': error(503, 'unavailable'),
      },
    });
    await store.restore();
    await store.signOut();
    expect(store.getState()).toEqual({ status: 'signedOut' });
  });

  test('a 401 for an earlier session does not end the current one', async () => {
    const reply = deferred<Reply>();
    const { store } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'GET /api/v1/games': () => reply.promise,
        'POST /api/v1/auth/login': { status: 200, body: { user: BOB, token: 'bob' } },
      },
    });
    await store.restore();
    const old = store.api.activeGames();
    await store.signIn('bob', 'pw');
    reply.resolve(error(401, 'not_authenticated'));
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(store.getState()).toEqual({ status: 'signedIn', user: BOB });
  });

  test('a 401 for the current session ends it', async () => {
    const { store } = setup({
      saved: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'GET /api/v1/games': error(401, 'not_authenticated'),
      },
    });
    await store.restore();
    await expect(store.api.activeGames()).rejects.toMatchObject({ status: 401 });
    expect(store.getState()).toEqual({ status: 'signedOut' });
  });
});

test('listeners hear every change until they unsubscribe', async () => {
  const { store } = setup();
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  await store.restore();
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  await store.forget();
  expect(listener).toHaveBeenCalledTimes(1);
});

describe('the username last signed in here', () => {
  const GUEST = { ...ME, username: 'guest-1', role: 'guest' as const };

  test('is read with the session, before the state says signed out', async () => {
    const { store } = setup({ username: 'alice' });
    expect(store.rememberedUsername()).toBeNull();
    await store.restore();
    expect(store.getState()).toEqual({ status: 'signedOut' });
    expect(store.rememberedUsername()).toBe('alice');
  });

  test('is kept on signing in, and after signing out', async () => {
    const { store, usernames } = setup({
      routes: {
        'POST /api/v1/auth/login': { status: 200, body: { user: BOB, token: 'bob' } },
        'POST /api/v1/auth/logout': { status: 204 },
      },
    });
    await store.restore();
    await store.signIn('bob', 'pw');
    expect(store.rememberedUsername()).toBe('bob');
    expect(usernames.current()).toBe('bob');
    await store.signOut();
    expect(store.rememberedUsername()).toBe('bob');
    expect(usernames.current()).toBe('bob');
  });

  test("a guest's is not kept (it has no password to sign in with)", async () => {
    const { store, usernames } = setup({ username: 'alice' });
    await store.restore();
    await store.start({ user: GUEST, token: 'g' });
    expect(store.rememberedUsername()).toBe('alice');
    expect(usernames.save).not.toHaveBeenCalled();
  });

  test('"Not you?" forgets it, and so does deleting the account', async () => {
    const { store, usernames, tokens } = setup({ username: 'alice' });
    await store.restore();
    await store.forgetUsername();
    expect(store.rememberedUsername()).toBeNull();
    expect(usernames.current()).toBeNull();
    await store.start({ user: ME, token: 'tok' });
    expect(usernames.current()).toBe('alice');
    await store.accountDeleted();
    expect(store.getState()).toEqual({ status: 'signedOut' });
    expect(tokens.current()).toBeNull();
    expect(usernames.current()).toBeNull();
  });

  test('one that cannot be read or saved is not remembered', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, usernames } = setup({ username: 'alice' });
    (usernames.load as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    (usernames.save as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    await store.restore();
    expect(store.rememberedUsername()).toBeNull();
    await store.start({ user: ME, token: 'tok' });
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    warn.mockRestore();
  });

  test('without a store nothing is remembered', async () => {
    const store = new SessionStore({
      baseUrl: 'https://api.example',
      transport: 'cookie',
      tokenStore: memoryTokenStore(),
      queryClient: new QueryClient(),
      fetch: fakeServer({ 'GET /api/v1/me': error(401, 'not_authenticated') }).fetch,
    });
    await store.restore();
    await store.forgetUsername();
    expect(store.rememberedUsername()).toBeNull();
  });
});

describe('signing up', () => {
  const DETAILS = {
    username: 'alice',
    email: 'alice@example.com',
    password: 'correct horse',
    terms_version: '2026-10-20',
    privacy_version: '2026-10-20',
  };

  test('signs the new account in at once', async () => {
    const { store, tokens } = setup({
      routes: { 'POST /api/v1/auth/register': { status: 201, body: { user: ME, token: 'new' } } },
    });
    await store.signUp(DETAILS);
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
    expect(tokens.current()).toBe('new');
    expect(store.rememberedUsername()).toBe('alice');
  });

  test('with Google, sends the ID token and the agreement', async () => {
    const { store, server } = setup({
      routes: { 'POST /api/v1/auth/google': { status: 200, body: { user: ME, token: 'g' } } },
    });
    await store.signInWithGoogle('id-token', {
      terms_version: '2026-10-20',
      privacy_version: '2026-10-20',
    });
    expect(server.last().body).toEqual({
      id_token: 'id-token',
      terms_version: '2026-10-20',
      privacy_version: '2026-10-20',
      transport: 'bearer',
    });
    expect(store.getState()).toEqual({ status: 'signedIn', user: ME });
  });
});
