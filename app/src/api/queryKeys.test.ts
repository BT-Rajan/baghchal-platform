import { queryKeys } from './queryKeys';

test('keys are stable and distinct', () => {
  expect(queryKeys.game('g1')).toEqual(['game', 'g1']);
  expect(queryKeys.playerSearch('al')).toEqual(['players', 'search', 'al']);
  expect(queryKeys.profile('alice')).toEqual(['player', 'alice']);
  expect(queryKeys.leaderboard('blitz')).toEqual(['leaderboard', 'blitz']);
  expect(queryKeys.modReports('open')).toEqual(['mod', 'reports', 'open']);
  expect(queryKeys.modPlayer('bob')).toEqual(['mod', 'player', 'bob']);
  expect(queryKeys.playerGames('bob')).toEqual(['player-games', 'bob']);
  const all = [
    queryKeys.challenges,
    queryKeys.friends,
    queryKeys.notifications,
    queryKeys.emote('x'),
    queryKeys.activeGames,
    queryKeys.onlinePlayers,
    queryKeys.game('x'),
    queryKeys.playerSearch('x'),
    queryKeys.profile('x'),
    queryKeys.leaderboard('x'),
    queryKeys.blocks,
    queryKeys.modReports('open'),
    queryKeys.modPlayer('x'),
    queryKeys.modFairPlay('x'),
    queryKeys.seekCounts,
    queryKeys.playerGames('x'),
    queryKeys.analysis('x'),
    queryKeys.appearance,
    queryKeys.payments,
    queryKeys.linkChallenge('x'),
    queryKeys.tournaments,
    queryKeys.tournament('x'),
    queryKeys.trainer('x'),
    queryKeys.dailyPuzzle,
  ].map((key) => JSON.stringify(key));
  expect(new Set(all).size).toBe(all.length);
});
