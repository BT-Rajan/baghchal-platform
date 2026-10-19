import type { ChallengeList, Game } from '@/api/types';
import { applyChallenge, applyGame, keys } from '@/realtime/cache';
import { CLOSE, parseServerMessage } from '@/realtime/protocol';
import {
  BACKOFF_MAX_MS,
  PING_INTERVAL_MS,
  RealtimeClient,
  SILENCE_LIMIT_MS,
  backoffDelay,
  type RealtimeOptions,
  type SocketLike,
} from '@/realtime/socket';

import { ALICE, BOB, challenge, game, testQueryClient } from './fixtures';

describe('parseServerMessage', () => {
  it('accepts the documented messages', () => {
    const hello = { type: 'hello', user: { id: 'u', username: 'a' } };
    expect(parseServerMessage(JSON.stringify(hello))).toEqual(hello);
    expect(parseServerMessage('{"type":"pong","extra":1}')).toEqual({ type: 'pong' });
    const c = { type: 'challenge', challenge: challenge() };
    expect(parseServerMessage(JSON.stringify(c))).toEqual(c);
    const g = { type: 'game', game: game() };
    expect(parseServerMessage(JSON.stringify(g))).toEqual(g);
    const e = { type: 'error', code: 'invalid_message', message: 'm' };
    expect(parseServerMessage(JSON.stringify(e))).toEqual(e);
  });

  it.each([
    [new ArrayBuffer(2)],
    ['not json'],
    ['[1,2]'],
    ['null'],
    ['{"type":"hello"}'],
    ['{"type":"hello","user":{"id":1}}'],
    ['{"type":"challenge","challenge":[]}'],
    ['{"type":"game","game":{"id":"g"}}'],
    ['{"type":"error"}'],
    ['{"type":"something-new"}'],
  ])('ignores %p', (data) => {
    expect(parseServerMessage(data)).toBeNull();
  });
});

describe('backoffDelay', () => {
  it('grows exponentially with full jitter, capped', () => {
    expect(backoffDelay(0, () => 0.999)).toBe(499);
    expect(backoffDelay(3, () => 0.5)).toBe(2000);
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(5, () => 0)).toBe(0);
  });
});

class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  sent: string[] = [];
  closed = false;
  constructor(
    readonly url: string,
    readonly token: string | null,
    private readonly throwOnClose = false,
  ) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    if (this.throwOnClose) throw new Error('already closed');
  }
  open() {
    this.onopen?.({});
  }
  hello() {
    this.onmessage?.({ data: JSON.stringify({ type: 'hello', user: { id: 'u', username: 'a' } }) });
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
  drop(code: number) {
    this.onclose?.({ code });
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(extra: Partial<RealtimeOptions> = {}) {
    const sockets: FakeSocket[] = [];
    const events = {
      onMessage: jest.fn(),
      onStatus: jest.fn(),
      onResync: jest.fn(),
      onSessionEnded: jest.fn(),
      onRefused: jest.fn(),
    };
    const client = new RealtimeClient({
      url: 'wss://api/ws',
      createSocket: (url, token) => {
        const s = new FakeSocket(url, token);
        sockets.push(s);
        return s;
      },
      getToken: () => 'tok',
      random: () => 0.5,
      ...events,
      ...extra,
    });
    const last = () => sockets[sockets.length - 1]!;
    return { client, sockets, last, ...events };
  }

  it('connects, greets and passes messages on', () => {
    const { client, last, onMessage, onStatus, onResync } = setup();
    client.start();
    client.start(); // idempotent
    expect(last()).toMatchObject({ url: 'wss://api/ws', token: 'tok' });
    expect(onStatus).toHaveBeenLastCalledWith('connecting');
    last().open();
    last().hello();
    expect(onStatus).toHaveBeenLastCalledWith('online');
    expect(onResync).not.toHaveBeenCalled();
    last().receive('{"type":"pong"}');
    last().receive('garbage');
    expect(onMessage.mock.calls.map(([m]) => m.type)).toEqual(['hello', 'pong']);
    last().onerror?.({});
    client.stop();
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    expect(last().closed).toBe(true);
  });

  it('pings while the connection is alive and gives up on a silent one', () => {
    const { client, sockets, last } = setup();
    client.start();
    last().open();
    last().hello();
    jest.advanceTimersByTime(PING_INTERVAL_MS);
    expect(last().sent).toEqual(['{"type":"ping"}']);
    last().receive('{"type":"pong"}');
    jest.advanceTimersByTime(SILENCE_LIMIT_MS + PING_INTERVAL_MS);
    expect(sockets[0]!.closed).toBe(true);
    jest.advanceTimersByTime(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('reconnects with backoff and resyncs after a gap', () => {
    const { client, sockets, last, onResync, onRefused, onStatus } = setup();
    client.start();
    last().open();
    last().hello();
    last().drop(1006);
    expect(onRefused).not.toHaveBeenCalled(); // it had said hello
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    jest.advanceTimersByTime(249);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    last().drop(1006); // refused before hello
    expect(onRefused).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(500); // attempt 1: 0.5 × 1000
    expect(sockets).toHaveLength(3);
    last().open();
    last().hello();
    expect(onResync).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it('stops for good when the session ends', () => {
    const { client, sockets, last, onSessionEnded, onStatus } = setup();
    client.start();
    last().open();
    last().hello();
    last().drop(CLOSE.sessionEnded);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    jest.advanceTimersByTime(BACKOFF_MAX_MS * 2);
    expect(sockets).toHaveLength(1);
  });

  it('does nothing after being stopped, even if a late close arrives', () => {
    const { client, sockets, onRefused } = setup();
    client.start();
    const first = sockets[0]!;
    const onclose = first.onclose!;
    client.stop();
    onclose({ code: 1006 });
    expect(onRefused).not.toHaveBeenCalled();
    jest.advanceTimersByTime(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(1);
  });

  it('cancels a retry that fires after stopping', () => {
    const { client, sockets, last } = setup();
    client.start();
    last().drop(1006);
    // Simulate a timer that was already due when stop() ran.
    const retry = jest.getTimerCount();
    expect(retry).toBe(1);
    client.stop();
    jest.advanceTimersByTime(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(1);
  });

  it('reconnects at once when nudged, but only while waiting', () => {
    const { client, sockets, last } = setup();
    client.nudge(); // not running
    expect(sockets).toHaveLength(0);
    client.start();
    client.nudge(); // connected already
    expect(sockets).toHaveLength(1);
    last().drop(1006);
    client.nudge();
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('uses Math.random for jitter by default', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const { client, sockets, last } = setup({ random: undefined });
    client.start();
    last().drop(1006);
    jest.advanceTimersByTime(0);
    expect(sockets).toHaveLength(2);
    spy.mockRestore();
    client.stop();
  });

  it('ignores a close from a socket it already replaced', () => {
    const { client, sockets, last, onRefused } = setup();
    client.start();
    const first = last();
    const onclose = first.onclose!;
    first.drop(1006);
    jest.advanceTimersByTime(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(2);
    onclose({ code: 1006 }); // stale handler from the first socket
    expect(onRefused).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('closes a socket that throws without breaking', () => {
    const sockets: FakeSocket[] = [];
    const client = new RealtimeClient({
      url: 'u',
      createSocket: (url, token) => {
        const s = new FakeSocket(url, token, true);
        sockets.push(s);
        return s;
      },
      getToken: () => null,
      onMessage: () => undefined,
    });
    client.start();
    sockets[0]!.open();
    sockets[0]!.hello();
    expect(() => client.stop()).not.toThrow();
    expect(sockets[0]!.closed).toBe(true);
  });
});

describe('cache', () => {
  const lists = (): ChallengeList => ({ incoming: [], outgoing: [] });

  it('keeps pending challenges in the right list and drops closed ones', () => {
    const qc = testQueryClient();
    applyChallenge(qc, BOB.id, challenge()); // nothing cached yet: no-op
    expect(qc.getQueryData(keys.challenges)).toBeUndefined();

    qc.setQueryData(keys.challenges, lists());
    applyChallenge(qc, BOB.id, challenge());
    expect(qc.getQueryData<ChallengeList>(keys.challenges)!.incoming).toHaveLength(1);
    applyChallenge(qc, BOB.id, challenge()); // same id again: replaced, not duplicated
    expect(qc.getQueryData<ChallengeList>(keys.challenges)!.incoming).toHaveLength(1);
    applyChallenge(qc, BOB.id, challenge({ status: 'declined' }));
    expect(qc.getQueryData<ChallengeList>(keys.challenges)).toEqual(lists());

    applyChallenge(qc, ALICE.id, challenge());
    expect(qc.getQueryData<ChallengeList>(keys.challenges)!.outgoing).toHaveLength(1);
  });

  it('stores newer game states only and reports newly started games', () => {
    const qc = testQueryClient();
    const started = game();
    expect(applyGame(qc, started)).toBe(true);
    expect(applyGame(qc, started)).toBe(false); // known now
    const moved = game({ ply: 1, side_to_move: 'tiger' });
    applyGame(qc, moved);
    applyGame(qc, started); // late, older snapshot
    expect(qc.getQueryData<Game>(keys.game(started.id))).toEqual(moved);
    expect(applyGame(qc, game({ id: 'other', ply: 5 }))).toBe(false); // joined mid-game
  });

  it('keeps the active games list current', () => {
    const qc = testQueryClient();
    const other = game({ id: 'other' });
    qc.setQueryData(keys.activeGames, [other]);
    const g = game();
    applyGame(qc, g);
    expect(qc.getQueryData<Game[]>(keys.activeGames)).toEqual([g, other]);
    const moved = game({ ply: 1 });
    applyGame(qc, moved);
    applyGame(qc, g);
    expect(qc.getQueryData<Game[]>(keys.activeGames)).toEqual([moved, other]);
    applyGame(qc, game({ ply: 1, status: 'finished' }));
    expect(qc.getQueryData<Game[]>(keys.activeGames)).toEqual([other]);
  });

  it('builds query keys', () => {
    expect(keys.profile('Alice')).toEqual(['players', 'profile', 'alice']);
    expect(keys.search('al')).toEqual(['players', 'search', 'al']);
    expect(keys.leaderboard('blitz')).toEqual(['leaderboard', 'blitz']);
    expect(keys.online).toEqual(['players', 'online']);
  });
});
