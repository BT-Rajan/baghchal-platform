import type { Client } from './client';
import { createApi } from './endpoints';

function recorder() {
  const calls: unknown[][] = [];
  const client: Client = {
    get: async (path, options) => {
      calls.push(['GET', path, options]);
      return undefined as never;
    },
    post: async (path, options) => {
      calls.push(['POST', path, options]);
      return undefined as never;
    },
  };
  return { client, calls };
}

test('every endpoint calls the right method, path and body', async () => {
  const { client, calls } = recorder();
  const api = createApi(client, 'bearer');
  const signal = new AbortController().signal;

  await api.register({ username: 'alice', email: 'a@example.com', password: 'p' });
  await api.verifyEmail('tok');
  await api.login('alice', 'pw');
  await api.logout();
  await api.requestPasswordReset('a@example.com');
  await api.confirmPasswordReset('tok', 'new');
  await api.me(signal);
  await api.searchPlayers('al', signal);
  await api.onlinePlayers();
  await api.profile('a b');
  await api.challenges();
  await api.challenge({ opponent: 'bob', time_control: '5+3', rated: true });
  await api.answerChallenge('c1', 'accept');
  await api.activeGames();
  await api.game('g1');
  await api.move('g1', 3, 'a1-b2');
  await api.gameAction('g1', 'claim-abandonment');
  await api.leaderboard('blitz');

  const V = '/api/v1';
  expect(calls).toEqual([
    [
      'POST',
      `${V}/auth/register`,
      { body: { username: 'alice', email: 'a@example.com', password: 'p' } },
    ],
    ['POST', `${V}/auth/verify-email`, { body: { token: 'tok', transport: 'bearer' } }],
    ['POST', `${V}/auth/login`, { body: { login: 'alice', password: 'pw', transport: 'bearer' } }],
    ['POST', `${V}/auth/logout`, undefined],
    ['POST', `${V}/auth/password-reset`, { body: { email: 'a@example.com' } }],
    ['POST', `${V}/auth/password-reset/confirm`, { body: { token: 'tok', password: 'new' } }],
    ['GET', `${V}/me`, { signal }],
    ['GET', `${V}/players`, { query: { prefix: 'al' }, signal }],
    ['GET', `${V}/players/online`, { signal: undefined }],
    ['GET', `${V}/players/a%20b`, { signal: undefined }],
    ['GET', `${V}/challenges`, { signal: undefined }],
    ['POST', `${V}/challenges`, { body: { opponent: 'bob', time_control: '5+3', rated: true } }],
    ['POST', `${V}/challenges/c1/accept`, undefined],
    ['GET', `${V}/games`, { signal: undefined }],
    ['GET', `${V}/games/g1`, { signal: undefined }],
    ['POST', `${V}/games/g1/moves`, { body: { ply: 3, move: 'a1-b2' } }],
    ['POST', `${V}/games/g1/claim-abandonment`, undefined],
    ['GET', `${V}/leaderboards/blitz`, { signal: undefined }],
  ]);
});
