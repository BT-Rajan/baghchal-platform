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
    put: async (path, options) => {
      calls.push(['PUT', path, options]);
      return undefined as never;
    },
    patch: async (path, options) => {
      calls.push(['PATCH', path, options]);
      return undefined as never;
    },
    delete: async (path, options) => {
      calls.push(['DELETE', path, options]);
      return undefined as never;
    },
  };
  return { client, calls };
}

test('every endpoint calls the right method, path and body', async () => {
  const { client, calls } = recorder();
  const api = createApi(client, 'bearer');
  const signal = new AbortController().signal;

  const agreed = { birth_month: '1990-01', terms_version: 't1', privacy_version: 'p1' };
  await api.register({ ...agreed, username: 'alice', email: 'a@example.com', password: 'p' });
  await api.verifyEmail('tok');
  await api.login('alice', 'pw');
  await api.logout();
  await api.requestPasswordReset('a@example.com');
  await api.confirmPasswordReset('tok', 'new');
  await api.me(signal);
  await api.playAsGuest(agreed);
  await api.legalVersions(signal);
  await api.legalDocument('privacy', signal);
  await api.acceptConsents({ terms_version: 't1', privacy_version: 'p1' });
  await api.parentLookUp('tok');
  await api.parentDecide('tok', 'refuse');
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
  await api.blocks();
  await api.block('b o');
  await api.unblock('bob');
  await api.changePassword('old', 'new');
  await api.changeEmail('pw', 'new@example.com');
  await api.confirmEmailChange('tok');
  await api.exportData();
  await api.deleteAccount('pw');
  await api.report('b o', { reason: 'cheating', details: 'd', game_id: 'g1' });
  await api.modReports('open', signal);
  await api.dismissReport('r1', 'fine');
  await api.modPlayer('bob');
  await api.modFairPlay('b o', signal);
  await api.suspend('bob', null, 'why');
  await api.unsuspend('bob', 'appeal');
  await api.rename('bob', 'nicebob', 'name');
  await api.playComputer({ level: 'hard', side: 'goat', time_control: '5+3' });
  await api.seek('5+3', true);
  await api.stopSeeking();
  await api.seekCounts(signal);
  await api.playerGames('b o');
  await api.playerGames('bob', '2026-01-01T00:00:00Z', signal);

  const V = '/api/v1';
  expect(calls).toEqual([
    [
      'POST',
      `${V}/auth/register`,
      { body: { ...agreed, username: 'alice', email: 'a@example.com', password: 'p' } },
    ],
    ['POST', `${V}/auth/verify-email`, { body: { token: 'tok', transport: 'bearer' } }],
    ['POST', `${V}/auth/login`, { body: { login: 'alice', password: 'pw', transport: 'bearer' } }],
    ['POST', `${V}/auth/logout`, undefined],
    ['POST', `${V}/auth/password-reset`, { body: { email: 'a@example.com' } }],
    ['POST', `${V}/auth/password-reset/confirm`, { body: { token: 'tok', password: 'new' } }],
    ['GET', `${V}/me`, { signal }],
    ['POST', `${V}/auth/guest`, { body: { ...agreed, transport: 'bearer' } }],
    ['GET', `${V}/legal`, { signal }],
    ['GET', `${V}/legal/privacy`, { signal }],
    ['POST', `${V}/me/consents`, { body: { terms_version: 't1', privacy_version: 'p1' } }],
    ['POST', `${V}/parent-consent/look-up`, { body: { token: 'tok' } }],
    ['POST', `${V}/parent-consent`, { body: { token: 'tok', decision: 'refuse' } }],
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
    ['GET', `${V}/blocks`, { signal: undefined }],
    ['PUT', `${V}/blocks/b%20o`, undefined],
    ['DELETE', `${V}/blocks/bob`, undefined],
    ['POST', `${V}/me/password`, { body: { current_password: 'old', new_password: 'new' } }],
    ['POST', `${V}/me/email`, { body: { password: 'pw', email: 'new@example.com' } }],
    ['POST', `${V}/auth/confirm-email`, { body: { token: 'tok' } }],
    ['GET', `${V}/me/export`, undefined],
    ['POST', `${V}/me/delete`, { body: { password: 'pw' } }],
    [
      'POST',
      `${V}/players/b%20o/report`,
      { body: { reason: 'cheating', details: 'd', game_id: 'g1' } },
    ],
    ['GET', `${V}/mod/reports`, { query: { status: 'open' }, signal }],
    ['POST', `${V}/mod/reports/r1/dismiss`, { body: { reason: 'fine' } }],
    ['GET', `${V}/mod/players/bob`, { signal: undefined }],
    ['GET', `${V}/mod/players/b%20o/fair-play`, { signal }],
    ['POST', `${V}/mod/players/bob/suspend`, { body: { days: null, reason: 'why' } }],
    ['POST', `${V}/mod/players/bob/unsuspend`, { body: { reason: 'appeal' } }],
    ['POST', `${V}/mod/players/bob/rename`, { body: { username: 'nicebob', reason: 'name' } }],
    ['POST', `${V}/games/computer`, { body: { level: 'hard', side: 'goat', time_control: '5+3' } }],
    ['POST', `${V}/seeks`, { body: { time_control: '5+3', rated: true } }],
    ['DELETE', `${V}/seeks`, undefined],
    ['GET', `${V}/seeks`, { signal }],
    ['GET', `${V}/players/b%20o/games`, { query: {}, signal: undefined }],
    ['GET', `${V}/players/bob/games`, { query: { before: '2026-01-01T00:00:00Z' }, signal }],
  ]);
});
