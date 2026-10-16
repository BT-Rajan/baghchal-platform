/** Query-cache keys shared by screens and by realtime events, which write into the same cache. */
export const queryKeys = {
  challenges: ['challenges'] as const,
  activeGames: ['games', 'active'] as const,
  game: (id: string) => ['game', id] as const,
  onlinePlayers: ['players', 'online'] as const,
  playerSearch: (prefix: string) => ['players', 'search', prefix] as const,
  profile: (username: string) => ['player', username] as const,
  leaderboard: (category: string) => ['leaderboard', category] as const,
};
