import { FakeSocket, openFakeSocket } from '../../tests/support/fakeSocket';

import {
  CLOSE_SIGNED_OUT,
  PING_INTERVAL_MS,
  RealtimeConnection,
  socketUrl,
  type ConnectionOptions,
} from './connection';
import { PING } from './protocol';

const URL = 'wss://api.example/api/v1/ws';

function setup(options: Partial<ConnectionOptions> = {}) {
  const calls = {
    onMessage: jest.fn(),
    onOpen: jest.fn(),
    onStatus: jest.fn(),
    onSignedOut: jest.fn(),
    onRefused: jest.fn(),
  };
  const connection = new RealtimeConnection({
    url: URL,
    token: () => 'tok',
    openSocket: openFakeSocket,
    random: () => 1, // the longest delay for each attempt: 1 s, 2 s, 4 s…
    ...calls,
    ...options,
  });
  return { connection, ...calls };
}

beforeEach(() => {
  FakeSocket.reset();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test('socketUrl', () => {
  expect(socketUrl('https://api.example/')).toBe('wss://api.example/api/v1/ws');
  expect(socketUrl('http://localhost:8000')).toBe('ws://localhost:8000/api/v1/ws');
  expect(socketUrl('HTTPS://API.example.com')).toBe('wss://api.example.com/api/v1/ws');
  expect(socketUrl('https://example.com/game/')).toBe('wss://example.com/game/api/v1/ws');
});

test('connects with the bearer token and delivers parsed messages', () => {
  const { connection, onMessage, onOpen, onStatus } = setup();
  connection.start();
  connection.start(); // already running: no second socket
  expect(FakeSocket.all).toHaveLength(1);
  const socket = FakeSocket.latest();
  expect(socket.url).toBe(URL);
  expect(socket.headers).toEqual({ Authorization: 'Bearer tok' });
  expect(connection.getStatus()).toBe('connecting');

  socket.open();
  expect(onOpen).toHaveBeenCalledWith(false);
  expect(onStatus.mock.calls.map(([s]) => s)).toEqual(['connecting', 'open']);

  socket.receive({ type: 'pong' });
  socket.receive('garbage');
  expect(onMessage.mock.calls).toEqual([[{ type: 'pong' }]]);
});

test('browsers send no header (the cookie goes by itself)', () => {
  const { connection } = setup({ token: () => null });
  connection.start();
  expect(FakeSocket.latest().headers).toEqual({});
});

test('reconnects with growing delays, and reports reconnections', () => {
  const { connection, onOpen, onRefused } = setup();
  connection.start();
  FakeSocket.latest().open();
  FakeSocket.latest().serverClose(1006);
  expect(connection.getStatus()).toBe('waiting');
  expect(onRefused).not.toHaveBeenCalled();

  jest.advanceTimersByTime(999);
  expect(FakeSocket.all).toHaveLength(1);
  jest.advanceTimersByTime(1);
  expect(FakeSocket.all).toHaveLength(2);

  // This one fails before opening (a refused handshake): check the session, wait longer.
  FakeSocket.latest().serverClose(1006);
  expect(onRefused).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1_999);
  expect(FakeSocket.all).toHaveLength(2);
  jest.advanceTimersByTime(1);
  expect(FakeSocket.all).toHaveLength(3);

  FakeSocket.latest().open();
  expect(onOpen.mock.calls).toEqual([[false], [true]]);

  // A successful open resets the backoff.
  FakeSocket.latest().serverClose(4429);
  jest.advanceTimersByTime(1_000);
  expect(FakeSocket.all).toHaveLength(4);
});

test.each([1003, 1009, 4408, 4429, 1001])('close code %i reconnects', (code) => {
  const { connection } = setup();
  connection.start();
  FakeSocket.latest().open();
  FakeSocket.latest().serverClose(code);
  jest.advanceTimersByTime(1_000);
  expect(FakeSocket.all).toHaveLength(2);
});

test('4401 means signed out: no reconnect', () => {
  const { connection, onSignedOut } = setup();
  connection.start();
  FakeSocket.latest().open();
  FakeSocket.latest().serverClose(CLOSE_SIGNED_OUT);
  expect(onSignedOut).toHaveBeenCalled();
  expect(connection.getStatus()).toBe('stopped');
  jest.advanceTimersByTime(60_000);
  expect(FakeSocket.all).toHaveLength(1);
});

test('pings every 25 s and drops a connection that stopped answering', () => {
  const { connection } = setup();
  connection.start();
  const socket = FakeSocket.latest();
  socket.open();

  jest.advanceTimersByTime(PING_INTERVAL_MS);
  expect(socket.sent).toEqual([PING]);
  socket.receive({ type: 'pong' });
  jest.advanceTimersByTime(PING_INTERVAL_MS);
  expect(socket.sent).toEqual([PING, PING]);

  // No pong this time: the next tick gives up on the socket and schedules a new one.
  jest.advanceTimersByTime(PING_INTERVAL_MS);
  expect(socket.closed).toBe(true);
  expect(socket.onclose).toBeNull();
  expect(connection.getStatus()).toBe('waiting');
  jest.advanceTimersByTime(1_000);
  expect(FakeSocket.all).toHaveLength(2);
});

test('stop closes the socket and cancels everything', () => {
  const { connection, onStatus } = setup();
  connection.start();
  const socket = FakeSocket.latest();
  socket.open();
  connection.stop();
  expect(socket.closed).toBe(true);
  expect(connection.getStatus()).toBe('stopped');
  expect(onStatus).toHaveBeenLastCalledWith('stopped');
  jest.advanceTimersByTime(120_000);
  expect(FakeSocket.all).toHaveLength(1);
  expect(socket.sent).toEqual([]);
  connection.stop(); // twice is fine
});

test('events from a socket we already let go of are ignored', () => {
  const { connection, onSignedOut } = setup();
  connection.start();
  const old = FakeSocket.latest();
  const onclose = old.onclose;
  connection.stop();
  connection.start();
  onclose?.({ code: CLOSE_SIGNED_OUT });
  expect(onSignedOut).not.toHaveBeenCalled();
  expect(connection.getStatus()).toBe('connecting');
});

test('resume reconnects at once while waiting, and only then', () => {
  const { connection } = setup();
  connection.resume(); // stopped: nothing
  connection.start();
  connection.resume(); // connecting: nothing
  expect(FakeSocket.all).toHaveLength(1);
  FakeSocket.latest().serverClose(1006);
  FakeSocket.latest().serverClose(1006); // the same socket again: ignored
  connection.resume();
  expect(FakeSocket.all).toHaveLength(2);
  jest.advanceTimersByTime(60_000); // the cancelled retry does not fire as well
  expect(FakeSocket.all).toHaveLength(2);
});

test('pause lets go of the connection until resume', () => {
  const { connection, onOpen, onStatus } = setup();
  connection.pause(); // stopped: nothing
  expect(connection.getStatus()).toBe('stopped');
  connection.start();
  const first = FakeSocket.latest();
  first.open();
  jest.advanceTimersByTime(PING_INTERVAL_MS - 1);
  connection.pause();
  expect(first.closed).toBe(true);
  expect(connection.getStatus()).toBe('paused');
  connection.pause(); // twice is fine
  jest.advanceTimersByTime(10 * 60_000); // no pings, no reconnects while paused
  expect(first.sent).toEqual([]);
  expect(FakeSocket.all).toHaveLength(1);
  connection.resume();
  FakeSocket.latest().open();
  expect(onOpen.mock.calls).toEqual([[false], [true]]); // a reconnect: catch up on events
  expect(onStatus.mock.calls.map(([s]) => s)).toEqual([
    'connecting',
    'open',
    'paused',
    'connecting',
    'open',
  ]);
});

test('close code 4410 (silent too long) reconnects', () => {
  const { connection } = setup();
  connection.start();
  FakeSocket.latest().open();
  FakeSocket.latest().serverClose(4410);
  jest.advanceTimersByTime(1_000);
  expect(FakeSocket.all).toHaveLength(2);
});

test('a socket that cannot even be created is retried', () => {
  let fail = true;
  const { connection } = setup({
    openSocket: (url, headers) => {
      if (fail) throw new Error('bad URL');
      return openFakeSocket(url, headers);
    },
  });
  connection.start();
  expect(connection.getStatus()).toBe('waiting');
  fail = false;
  jest.advanceTimersByTime(1_000);
  expect(FakeSocket.all).toHaveLength(1);
});

describe('the default socket', () => {
  const original = globalThis.WebSocket;
  afterEach(() => {
    globalThis.WebSocket = original;
  });

  test('passes headers as React Native options, or nothing in browsers', () => {
    const created: unknown[][] = [];
    globalThis.WebSocket = jest.fn((...args: unknown[]) => {
      created.push(args);
      return new FakeSocket(String(args[0]));
    }) as unknown as typeof WebSocket;
    const app = new RealtimeConnection({ url: URL, token: () => 't', onMessage: jest.fn() });
    app.start();
    const web = new RealtimeConnection({ url: URL, token: () => null, onMessage: jest.fn() });
    web.start();
    expect(created).toEqual([[URL, undefined, { headers: { Authorization: 'Bearer t' } }], [URL]]);
    // Without callbacks or a random source, the connection still works.
    FakeSocket.latest().open();
    FakeSocket.latest().serverClose(CLOSE_SIGNED_OUT);
    FakeSocket.all[0]?.serverClose(1006);
    jest.advanceTimersByTime(30_000);
    expect(created).toHaveLength(3);
  });
});
