import { queryKeys } from './queryKeys';

test('keys are stable and distinct', () => {
  expect(queryKeys.game('g1')).toEqual(['game', 'g1']);
  expect(queryKeys.playerSearch('al')).toEqual(['players', 'search', 'al']);
  expect(queryKeys.profile('alice')).toEqual(['player', 'alice']);
  expect(queryKeys.leaderboard('blitz')).toEqual(['leaderboard', 'blitz']);
  const all = [
    queryKeys.challenges,
    queryKeys.activeGames,
    queryKeys.onlinePlayers,
    queryKeys.game('x'),
    queryKeys.playerSearch('x'),
    queryKeys.profile('x'),
    queryKeys.leaderboard('x'),
    queryKeys.blocks,
  ].map((key) => JSON.stringify(key));
  expect(new Set(all).size).toBe(all.length);
});
