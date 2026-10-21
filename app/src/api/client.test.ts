import { ME, error, fakeServer } from '../../tests/support/fakeServer';

import { DEFAULT_TIMEOUT_MS, buildUrl, createClient, type ClientOptions } from './client';
import { ApiError } from './errors';

function client(server: ReturnType<typeof fakeServer>, options: Partial<ClientOptions> = {}) {
  return createClient({
    baseUrl: 'https://api.example/',
    transport: 'bearer',
    auth: () => ({ token: 'tok', epoch: 7 }),
    onSignedOut: jest.fn(),
    onConsentsNeeded: jest.fn(),
    fetch: server.fetch,
    ...options,
  });
}

test('buildUrl joins the base, path and defined query values', () => {
  expect(buildUrl('https://a.example//', '/x')).toBe('https://a.example/x');
  expect(buildUrl('https://a.example', '/x', { q: 'a b', n: 2, f: false, skip: undefined })).toBe(
    'https://a.example/x?q=a%20b&n=2&f=false',
  );
});

test('GET with a bearer token', async () => {
  const server = fakeServer({ 'GET /api/v1/me': { status: 200, body: ME } });
  await expect(client(server).get('/api/v1/me', { query: { a: 1 } })).resolves.toEqual(ME);
  expect(server.last()).toMatchObject({
    method: 'GET',
    query: { a: '1' },
    credentials: 'omit',
    headers: { Accept: 'application/json', Authorization: 'Bearer tok' },
    body: undefined,
  });
  expect(server.last().headers['Content-Type']).toBeUndefined();
});

test('bearer transport without a token sends no Authorization header', async () => {
  const server = fakeServer({ 'GET /x': { status: 200, body: {} } });
  await client(server, { auth: () => ({ token: null, epoch: 0 }) }).get('/x');
  expect(server.last().headers.Authorization).toBeUndefined();
});

test('POST JSON with the cookie transport', async () => {
  const server = fakeServer({ 'POST /x': { status: 201, body: { ok: true } } });
  const cookie = client(server, { transport: 'cookie' });
  await expect(cookie.post('/x', { body: { a: 1 } })).resolves.toEqual({ ok: true });
  expect(server.last()).toMatchObject({
    credentials: 'include',
    body: { a: 1 },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(server.last().headers.Authorization).toBeUndefined();
});

test('204 resolves to undefined', async () => {
  const server = fakeServer({ 'POST /logout': { status: 204 } });
  await expect(client(server).post('/logout')).resolves.toBeUndefined();
});

test('PUT, PATCH and DELETE', async () => {
  const server = fakeServer({
    'PUT /b': { status: 204 },
    'PATCH /b': { status: 204 },
    'DELETE /b': { status: 204 },
  });
  await expect(client(server).put('/b')).resolves.toBeUndefined();
  await expect(client(server).patch('/b')).resolves.toBeUndefined();
  await expect(client(server).delete('/b')).resolves.toBeUndefined();
  expect(server.requests.map((r) => r.method)).toEqual(['PUT', 'PATCH', 'DELETE']);
});

test('a success without a JSON body is a bad response', async () => {
  const server = fakeServer({
    'GET /a': { status: 200, text: '<html>' },
    'GET /b': { status: 200 },
  });
  await expect(client(server).get('/a')).rejects.toMatchObject({ code: 'bad_response' });
  await expect(client(server).get('/b')).rejects.toMatchObject({ code: 'bad_response' });
});

test('error responses become ApiErrors', async () => {
  const server = fakeServer({
    'POST /m': error(409, 'stale_position', 'The game moved on.'),
    'GET /html': { status: 502, text: 'Bad gateway' },
  });
  const onSignedOut = jest.fn();
  const c = client(server, { onSignedOut });
  const thrown = await c.post('/m').catch((e: unknown) => e);
  expect(thrown).toBeInstanceOf(ApiError);
  expect(thrown).toMatchObject({
    status: 409,
    code: 'stale_position',
    message: 'The game moved on.',
  });
  await expect(c.get('/html')).rejects.toMatchObject({ status: 502, code: 'http_error' });
  expect(onSignedOut).not.toHaveBeenCalled();
});

test('not_authenticated reports the end of the session, with the epoch of the request', async () => {
  const server = fakeServer({ 'GET /me': error(401, 'not_authenticated') });
  const onSignedOut = jest.fn();
  await expect(client(server, { onSignedOut }).get('/me')).rejects.toMatchObject({ status: 401 });
  expect(onSignedOut).toHaveBeenCalledWith(7);
});

test('consents_needed reports the changed terms, with the epoch of the request', async () => {
  const server = fakeServer({ 'GET /games': error(403, 'consents_needed') });
  const onConsentsNeeded = jest.fn();
  const onSignedOut = jest.fn();
  await expect(
    client(server, { onConsentsNeeded, onSignedOut }).get('/games'),
  ).rejects.toMatchObject({ status: 403, code: 'consents_needed' });
  expect(onConsentsNeeded).toHaveBeenCalledWith(7);
  expect(onSignedOut).not.toHaveBeenCalled();
});

test('wrong credentials do not end the session', async () => {
  const server = fakeServer({ 'POST /login': error(401, 'invalid_credentials') });
  const onSignedOut = jest.fn();
  await expect(client(server, { onSignedOut }).post('/login')).rejects.toMatchObject({
    code: 'invalid_credentials',
  });
  expect(onSignedOut).not.toHaveBeenCalled();
});

test('uses the global fetch by default', async () => {
  const server = fakeServer({ 'GET /x': { status: 200, body: 1 } });
  const original = globalThis.fetch;
  globalThis.fetch = server.fetch;
  try {
    const c = createClient({
      baseUrl: 'https://api.example',
      transport: 'cookie',
      auth: () => ({ token: null, epoch: 0 }),
      onSignedOut: jest.fn(),
      onConsentsNeeded: jest.fn(),
    });
    await expect(c.get('/x')).resolves.toBe(1);
  } finally {
    globalThis.fetch = original;
  }
});

test('a failed fetch is a network error', async () => {
  const fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  const c = createClient({
    baseUrl: 'https://api.example',
    transport: 'cookie',
    auth: () => ({ token: null, epoch: 0 }),
    onSignedOut: jest.fn(),
    onConsentsNeeded: jest.fn(),
    fetch,
  });
  await expect(c.get('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
});

/** A fetch that never answers, but rejects when its signal aborts (as fetch does). */
function hangingFetch() {
  return jest.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
      }),
  );
}

describe('timeouts and cancellation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const base = {
    baseUrl: 'https://api.example',
    transport: 'cookie' as const,
    auth: () => ({ token: null, epoch: 0 }),
    onSignedOut: jest.fn(),
    onConsentsNeeded: jest.fn(),
  };

  test('a request that takes too long times out', async () => {
    const c = createClient({ ...base, fetch: hangingFetch(), timeoutMs: 1000 });
    const result = c.get('/slow');
    jest.advanceTimersByTime(1000);
    await expect(result).rejects.toMatchObject({ status: 0, code: 'timeout' });
  });

  test('the default timeout applies', async () => {
    const c = createClient({ ...base, fetch: hangingFetch() });
    const result = c.get('/slow');
    jest.advanceTimersByTime(DEFAULT_TIMEOUT_MS - 1);
    jest.advanceTimersByTime(1);
    await expect(result).rejects.toMatchObject({ code: 'timeout' });
  });

  test("the caller's signal cancels the request, and its error passes through", async () => {
    const c = createClient({ ...base, fetch: hangingFetch() });
    const controller = new AbortController();
    const result = c.get('/slow', { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toThrow('AbortError');
  });
});
