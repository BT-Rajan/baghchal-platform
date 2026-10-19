import { ApiClient } from '@/api/client';
import { apiBaseUrl, socketUrl } from '@/api/config';
import { ApiError, describeError, errorFromBody } from '@/api/errors';

import { respond } from './fixtures';

describe('apiBaseUrl', () => {
  it('defaults to the local server and trims trailing slashes', () => {
    expect(apiBaseUrl(undefined, false)).toBe('http://localhost:8000');
    expect(apiBaseUrl(' https://api.example.com/// ', true)).toBe('https://api.example.com');
  });

  it('rejects anything but http(s)', () => {
    expect(() => apiBaseUrl('ftp://x', false)).toThrow('must be an http(s) URL');
    expect(() => apiBaseUrl('', false)).toThrow('must be an http(s) URL');
  });

  it('insists on https in production, except for localhost', () => {
    expect(() => apiBaseUrl('http://api.example.com', true)).toThrow('must use https');
    expect(apiBaseUrl('http://127.0.0.1:8000', true)).toBe('http://127.0.0.1:8000');
    expect(apiBaseUrl('http://api.example.com', false)).toBe('http://api.example.com');
  });

  it('derives the socket URL', () => {
    expect(socketUrl('https://api.example.com')).toBe('wss://api.example.com/api/v1/ws');
    expect(socketUrl('http://localhost:8000')).toBe('ws://localhost:8000/api/v1/ws');
  });
});

describe('errors', () => {
  it('parses the server error shape, keeping only well-formed field problems', () => {
    const error = errorFromBody(422, {
      error: {
        code: 'invalid_request',
        message: 'Invalid request.',
        fields: [{ field: 'password', problem: 'too short' }, { field: 1 }, 'junk'],
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('invalid_request');
    expect(error.fields).toEqual([{ field: 'password', problem: 'too short' }]);
    expect(error.fieldProblem('password')).toBe('too short');
    expect(error.fieldProblem('email')).toBeUndefined();
  });

  it('falls back for bodies of any other shape', () => {
    for (const body of [undefined, null, [], 'text', { error: 'x' }, { error: { code: 1 } }]) {
      const error = errorFromBody(502, body);
      expect(error.code).toBe('http_error');
      expect(error.fields).toEqual([]);
    }
    expect(errorFromBody(400, { error: { code: 'x', message: 'y', fields: 'no' } }).fields).toEqual(
      [],
    );
  });

  it('describes errors for people', () => {
    expect(describeError(new ApiError(0, 'network_error', 'x'))).toMatch(/Cannot reach/);
    expect(describeError(new ApiError(0, 'timeout', 'x'))).toMatch(/too long/);
    expect(describeError(new ApiError(409, 'player_busy', 'Busy.'))).toBe('Busy.');
    expect(describeError(new Error('boom'))).toBe('Something went wrong.');
  });
});

describe('ApiClient', () => {
  const setup = (transport: 'cookie' | 'bearer', answer: Response | Error = respond(200, {})) => {
    const fetch = jest.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    const api = new ApiClient({ baseUrl: 'https://api.test', transport, fetch, timeoutMs: 50 });
    const call = () => fetch.mock.calls[0] as unknown as [string, RequestInit];
    return { api, fetch, call };
  };

  it('uses cookies in browsers and never sends a token', async () => {
    const { api, call } = setup('cookie', respond(200, { id: 'u' }));
    api.setToken('ignored');
    await expect(api.me()).resolves.toEqual({ id: 'u' });
    const [url, init] = call();
    expect(url).toBe('https://api.test/api/v1/me');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ accept: 'application/json' });
    expect(init.body).toBeUndefined();
  });

  it('sends a bearer token in apps once it has one', async () => {
    const { api, fetch, call } = setup('bearer');
    await api.me();
    expect((call()[1].headers as Record<string, string>).authorization).toBeUndefined();
    api.setToken('t0k');
    expect(api.getToken()).toBe('t0k');
    await api.me();
    const init = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t0k');
    expect(init.credentials).toBe('omit');
    expect(api.baseUrl).toBe('https://api.test');
  });

  it('sends JSON bodies and asks for the matching session transport', async () => {
    const { api, call } = setup('bearer', respond(200, { user: {}, token: 't' }));
    await api.login('alice', 'pw');
    const [url, init] = call();
    expect(url).toBe('https://api.test/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      login: 'alice',
      password: 'pw',
      transport: 'bearer',
    });
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('returns nothing for 204', async () => {
    const { api } = setup('cookie', respond(204));
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('turns error responses into ApiErrors', async () => {
    const { api } = setup('cookie', respond(409, { error: { code: 'player_busy', message: 'm' } }));
    await expect(
      api.createChallenge({ opponent: 'bob', time_control: '5+3', rated: false }),
    ).rejects.toMatchObject({ status: 409, code: 'player_busy' });
  });

  it('copes with error bodies that are not JSON', async () => {
    const { api } = setup('cookie', respond(502, undefined, '<html>bad gateway</html>'));
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: 'http_error' });
  });

  it('reports a lost session once, only for not_authenticated', async () => {
    const lost = jest.fn();
    const unauthenticated = setup(
      'cookie',
      respond(401, { error: { code: 'not_authenticated', message: 'm' } }),
    );
    unauthenticated.api.setUnauthenticatedHandler(lost);
    await expect(unauthenticated.api.me()).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledTimes(1);

    const wrongPassword = setup(
      'cookie',
      respond(401, { error: { code: 'invalid_credentials', message: 'm' } }),
    );
    wrongPassword.api.setUnauthenticatedHandler(lost);
    await expect(wrongPassword.api.login('a', 'b')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(lost).toHaveBeenCalledTimes(1);

    const noHandler = setup(
      'cookie',
      respond(401, { error: { code: 'not_authenticated', message: 'm' } }),
    );
    await expect(noHandler.api.me()).rejects.toMatchObject({ code: 'not_authenticated' });
  });

  it('distinguishes network failures from timeouts', async () => {
    const { api } = setup('cookie', new TypeError('Failed to fetch'));
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'network_error' });

    const fetch = jest.fn(
      (_: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const slow = new ApiClient({
      baseUrl: 'https://api.test',
      transport: 'cookie',
      fetch: fetch as never,
      timeoutMs: 5,
    });
    await expect(slow.me()).rejects.toMatchObject({ status: 0, code: 'timeout' });
  });

  it('uses the global fetch by default', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => respond(200, [])) as never;
    try {
      const api = new ApiClient({ baseUrl: 'https://api.test', transport: 'cookie' });
      await expect(api.activeGames()).resolves.toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('builds every endpoint, escaping path and query parts', async () => {
    const { api, fetch } = setup('cookie', respond(200, {}));
    const calls: [() => Promise<unknown>, string, string, unknown?][] = [
      [
        () => api.register({ username: 'a', email: 'e', password: 'p' }),
        'POST',
        '/api/v1/auth/register',
        { username: 'a', email: 'e', password: 'p' },
      ],
      [
        () => api.verifyEmail('tok'),
        'POST',
        '/api/v1/auth/verify-email',
        { token: 'tok', transport: 'cookie' },
      ],
      [
        () => api.requestPasswordReset('e@x'),
        'POST',
        '/api/v1/auth/password-reset',
        { email: 'e@x' },
      ],
      [
        () => api.confirmPasswordReset('tok', 'pw'),
        'POST',
        '/api/v1/auth/password-reset/confirm',
        { token: 'tok', password: 'pw' },
      ],
      [() => api.searchPlayers('a b&c'), 'GET', '/api/v1/players?prefix=a%20b%26c&limit=20'],
      [() => api.onlinePlayers(), 'GET', '/api/v1/players/online?limit=50'],
      [() => api.profile('a/b'), 'GET', '/api/v1/players/a%2Fb'],
      [() => api.challenges(), 'GET', '/api/v1/challenges'],
      [
        () => api.createChallenge({ opponent: 'b', time_control: '3+2', rated: true }),
        'POST',
        '/api/v1/challenges',
        { opponent: 'b', time_control: '3+2', rated: true },
      ],
      [() => api.respond('c1', 'accept'), 'POST', '/api/v1/challenges/c1/accept'],
      [() => api.activeGames(), 'GET', '/api/v1/games'],
      [() => api.game('g1'), 'GET', '/api/v1/games/g1'],
      [
        () => api.move('g1', 3, 'a1-a2'),
        'POST',
        '/api/v1/games/g1/moves',
        { ply: 3, move: 'a1-a2' },
      ],
      [() => api.resign('g1'), 'POST', '/api/v1/games/g1/resign'],
      [() => api.abort('g1'), 'POST', '/api/v1/games/g1/abort'],
      [() => api.claimAbandonment('g1'), 'POST', '/api/v1/games/g1/claim-abandonment'],
      [() => api.leaderboard('rapid'), 'GET', '/api/v1/leaderboards/rapid?limit=100'],
    ];
    for (const [i, [run, method, path, body]] of calls.entries()) {
      fetch.mockResolvedValueOnce(respond(200, {}));
      await run();
      const [url, init] = fetch.mock.calls[i] as unknown as [string, RequestInit];
      expect([init.method, url]).toEqual([method, `https://api.test${path}`]);
      expect(init.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(body);
    }
  });
});

describe('contract with the server schema', () => {
  const schema = require('@/api/openapi.json') as {
    components: {
      schemas: Record<string, { properties: Record<string, Record<string, unknown>> }>;
    };
  };
  const property = (model: string, name: string) =>
    schema.components.schemas[model]!.properties[name]!;

  it('offers exactly the time controls the server accepts', () => {
    const { TIME_CONTROLS } = jest.requireActual('@/api/types') as typeof import('@/api/types');
    expect(TIME_CONTROLS.map((t) => t.label)).toEqual(property('ChallengeIn', 'time_control').enum);
  });

  it('validates forms with the server rules', () => {
    const rules = jest.requireActual('@/auth/validation') as typeof import('@/auth/validation');
    expect(rules.USERNAME.source).toBe(property('RegisterIn', 'username').pattern);
    expect(rules.LINK_TOKEN.source).toBe(property('VerifyEmailIn', 'token').pattern);
    expect(rules.MIN_PASSWORD).toBe(property('RegisterIn', 'password').minLength);
    expect(rules.MAX_PASSWORD).toBe(property('RegisterIn', 'password').maxLength);
  });
});
