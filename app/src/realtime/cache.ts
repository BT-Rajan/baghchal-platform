import type { QueryClient } from '@tanstack/react-query';

import type { Challenge, ChallengeList, Game } from '@/api/types';
import { latest } from '@/game/order';

export const keys = {
  challenges: ['challenges'] as const,
  activeGames: ['games', 'active'] as const,
  game: (id: string) => ['game', id] as const,
  online: ['players', 'online'] as const,
  search: (prefix: string) => ['players', 'search', prefix] as const,
  profile: (username: string) => ['players', 'profile', username.toLowerCase()] as const,
  leaderboard: (category: string) => ['leaderboard', category] as const,
};

/** Puts a challenge's new state into the lists: pending ones are shown, the rest drop out. */
export function applyChallenge(queryClient: QueryClient, me: string, challenge: Challenge): void {
  queryClient.setQueryData<ChallengeList>(keys.challenges, (lists) => {
    if (!lists) return lists;
    const without = (list: Challenge[]) => list.filter((c) => c.id !== challenge.id);
    const next = { incoming: without(lists.incoming), outgoing: without(lists.outgoing) };
    if (challenge.status === 'pending') {
      const list = challenge.opponent.id === me ? next.incoming : next.outgoing;
      list.unshift(challenge);
    }
    return next;
  });
}

/**
 * Stores a game snapshot if it is newer than the one we have. Returns true when it is a game
 * we had not seen that has just started, so the caller can open it.
 */
export function applyGame(queryClient: QueryClient, game: Game): boolean {
  const key = keys.game(game.id);
  const known = queryClient.getQueryData<Game>(key);
  queryClient.setQueryData<Game>(key, latest(known, game));
  queryClient.setQueryData<Game[]>(keys.activeGames, (games) => {
    if (!games) return games;
    const others = games.filter((g) => g.id !== game.id);
    if (game.status !== 'active') return others;
    const current = games.find((g) => g.id === game.id);
    return [latest(current, game), ...others];
  });
  return !known && game.status === 'active' && game.ply === 0;
}
