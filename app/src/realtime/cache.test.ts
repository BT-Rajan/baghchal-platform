import { QueryClient } from '@tanstack/react-query';

import { ME } from '../../tests/support/fakeServer';
import { BOB, challenge, game } from '../../tests/support/games';

import type { ChallengeList, Game } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';

import { applyChallenge, applyGame, applyMessage, isNewer, refetchAfterReconnect } from './cache';

/** Without garbage collection, whose 5-minute timers would outlive the tests. */
const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

describe('isNewer', () => {
  const base = game({ ply: 4, server_time: '2026-01-01T12:00:00Z' });

  test('anything beats nothing', () => {
    expect(isNewer(base, undefined)).toBe(true);
  });

  test('a higher ply wins', () => {
    expect(isNewer(game({ ply: 5 }), base)).toBe(true);
    expect(isNewer(game({ ply: 3, server_time: '2027-01-01T00:00:00Z' }), base)).toBe(false);
  });

  test('at the same ply, finished beats active (resigning adds no move)', () => {
    const finished = game({ ply: 4, status: 'finished', server_time: '2025-01-01T00:00:00Z' });
    expect(isNewer(finished, base)).toBe(true);
    expect(isNewer(base, finished)).toBe(false);
  });

  test('otherwise the later server time wins', () => {
    expect(isNewer(game({ ply: 4, server_time: '2026-01-01T12:00:01Z' }), base)).toBe(true);
    expect(isNewer(game({ ply: 4 }), base)).toBe(false);
  });
});

describe('applyChallenge', () => {
  const lists = (qc: QueryClient) => qc.getQueryData<ChallengeList>(queryKeys.challenges);

  test('does nothing until the lists are loaded', () => {
    const qc = testQueryClient();
    applyChallenge(qc, challenge(), ME.id);
    expect(lists(qc)).toBeUndefined();
  });

  test('files pending challenges by direction, replacing older copies', () => {
    const qc = testQueryClient();
    qc.setQueryData<ChallengeList>(queryKeys.challenges, {
      incoming: [challenge({ id: 'c1', time_control: '3+2' })],
      outgoing: [],
    });
    applyChallenge(qc, challenge({ id: 'c1' }), ME.id);
    const mine = challenge({
      id: 'c2',
      challenger: { id: ME.id, username: ME.username },
      opponent: BOB,
    });
    applyChallenge(qc, mine, ME.id);
    expect(lists(qc)).toEqual({ incoming: [challenge({ id: 'c1' })], outgoing: [mine] });
  });

  test('drops challenges that are no longer pending', () => {
    const qc = testQueryClient();
    qc.setQueryData<ChallengeList>(queryKeys.challenges, { incoming: [challenge()], outgoing: [] });
    applyChallenge(qc, challenge({ status: 'accepted', game_id: 'g1' }), ME.id);
    expect(lists(qc)).toEqual({ incoming: [], outgoing: [] });
  });

  test('ignores challenges between other players', () => {
    const qc = testQueryClient();
    qc.setQueryData<ChallengeList>(queryKeys.challenges, { incoming: [], outgoing: [] });
    applyChallenge(qc, challenge({ opponent: { id: 'x', username: 'x' } }), ME.id);
    expect(lists(qc)).toEqual({ incoming: [], outgoing: [] });
  });
});

describe('applyGame', () => {
  const cached = (qc: QueryClient, id = 'g1') => qc.getQueryData<Game>(queryKeys.game(id));
  const active = (qc: QueryClient) => qc.getQueryData<Game[]>(queryKeys.activeGames);

  test('a game we had not seen, at ply 0, has just started', () => {
    const qc = testQueryClient();
    expect(applyGame(qc, game())).toEqual({ started: true });
    expect(cached(qc)).toEqual(game());
    expect(active(qc)).toBeUndefined(); // the list was never loaded
  });

  test('an unseen game already under way is not announced', () => {
    expect(applyGame(testQueryClient(), game({ ply: 7 }))).toEqual({ started: false });
    expect(applyGame(testQueryClient(), game({ status: 'finished' }))).toEqual({ started: false });
  });

  test('keeps the newest state and ignores older ones', () => {
    const qc = testQueryClient();
    applyGame(qc, game({ ply: 3 }));
    expect(applyGame(qc, game({ ply: 2 }))).toEqual({ started: false });
    expect(cached(qc)?.ply).toBe(3);
    expect(applyGame(qc, game({ ply: 4 }))).toEqual({ started: false });
    expect(cached(qc)?.ply).toBe(4);
  });

  test('keeps the list of live games in step', () => {
    const qc = testQueryClient();
    const other = game({ id: 'g2', ply: 9 });
    qc.setQueryData<Game[]>(queryKeys.activeGames, [other]);
    applyGame(qc, game({ ply: 1 }));
    expect(active(qc)).toEqual([other, game({ ply: 1 })]);
    applyGame(qc, game({ ply: 2 }));
    expect(active(qc)).toEqual([other, game({ ply: 2 })]);
    applyGame(qc, game({ ply: 2, status: 'finished' }));
    expect(active(qc)).toEqual([other]);
  });

  test('does not let an older state replace a newer listed one', () => {
    const qc = testQueryClient();
    qc.setQueryData<Game[]>(queryKeys.activeGames, [game({ ply: 5 })]);
    // The game's own entry is older (it was loaded before the list was).
    qc.setQueryData(queryKeys.game('g1'), game({ ply: 3 }));
    applyGame(qc, game({ ply: 4 }));
    expect(active(qc)).toEqual([game({ ply: 5 })]);
  });
});

describe('applyMessage', () => {
  test('hello from someone else means another user signed in', () => {
    const qc = testQueryClient();
    expect(
      applyMessage(qc, { type: 'hello', user: { id: ME.id, username: 'alice' } }, ME.id),
    ).toEqual({ startedGame: null, otherUser: false });
    expect(applyMessage(qc, { type: 'hello', user: BOB }, ME.id).otherUser).toBe(true);
  });

  test('routes challenges and games into the cache', () => {
    const qc = testQueryClient();
    qc.setQueryData<ChallengeList>(queryKeys.challenges, { incoming: [], outgoing: [] });
    applyMessage(qc, { type: 'challenge', challenge: challenge() }, ME.id);
    expect(qc.getQueryData<ChallengeList>(queryKeys.challenges)?.incoming).toHaveLength(1);
    expect(applyMessage(qc, { type: 'game', game: game() }, ME.id).startedGame).toEqual(game());
    expect(applyMessage(qc, { type: 'game', game: game() }, ME.id).startedGame).toBeNull();
  });

  test('pongs change nothing; errors are logged', () => {
    const qc = testQueryClient();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(applyMessage(qc, { type: 'pong' }, ME.id)).toEqual({
      startedGame: null,
      otherUser: false,
    });
    expect(applyMessage(qc, { type: 'probe', id: 1 }, ME.id)).toEqual({
      startedGame: null,
      otherUser: false,
    });
    applyMessage(qc, { type: 'error', code: 'invalid_message', message: 'm' }, ME.id);
    expect(warn).toHaveBeenCalledWith('Realtime error from the server', 'invalid_message', 'm');
    warn.mockRestore();
  });
});

test('after a reconnect, challenges and games are fetched again', async () => {
  const qc = testQueryClient();
  const invalidate = jest.spyOn(qc, 'invalidateQueries');
  await refetchAfterReconnect(qc);
  expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
    queryKeys.challenges,
    queryKeys.activeGames,
    ['game'],
  ]);
});
