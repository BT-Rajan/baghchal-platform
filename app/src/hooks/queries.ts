import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChallengeResponse } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { Category, ChallengeIn, Game } from '@/api/types';
import { latest } from '@/game/order';
import { applyChallenge, applyGame, keys } from '@/realtime/cache';
import { useRealtime } from '@/realtime/provider';
import { useMe } from '@/auth/session';
import { api } from '@/services';

export { useNow } from './use-now';

export function useChallenges() {
  return useQuery({ queryKey: keys.challenges, queryFn: () => api.challenges() });
}

export function useActiveGames() {
  return useQuery({ queryKey: keys.activeGames, queryFn: () => api.activeGames() });
}

export function useOnlinePlayers() {
  return useQuery({
    queryKey: keys.online,
    queryFn: () => api.onlinePlayers(),
    refetchInterval: 20_000,
  });
}

export function usePlayerSearch(prefix: string) {
  const valid = /^[A-Za-z0-9_-]{1,20}$/.test(prefix);
  return useQuery({
    queryKey: keys.search(prefix.toLowerCase()),
    queryFn: () => api.searchPlayers(prefix),
    enabled: valid,
  });
}

export function useProfile(username: string) {
  return useQuery({ queryKey: keys.profile(username), queryFn: () => api.profile(username) });
}

export function useLeaderboard(category: Category) {
  return useQuery({
    queryKey: keys.leaderboard(category),
    queryFn: () => api.leaderboard(category),
  });
}

export function useGame(id: string) {
  const queryClient = useQueryClient();
  const { clock } = useRealtime();
  return useQuery({
    queryKey: keys.game(id),
    queryFn: async () => {
      const game = await api.game(id);
      clock.observe(game.server_time, Date.now());
      // An event may have brought a newer state while this request was in flight.
      return latest(queryClient.getQueryData<Game>(keys.game(id)), game);
    },
  });
}

/** Codes meaning our copy of the game is out of date: refetch and let the player look again. */
const STALE = new Set(['stale_position', 'not_your_turn', 'game_over', 'cannot_abort']);

export function useGameAction<A extends unknown[]>(id: string, run: (...args: A) => Promise<Game>) {
  const queryClient = useQueryClient();
  const { clock } = useRealtime();
  return useMutation({
    mutationFn: (args: A) => run(...args),
    onSuccess: (game) => {
      clock.observe(game.server_time, Date.now());
      applyGame(queryClient, game);
    },
    onError: (error) => {
      if (error instanceof ApiError && STALE.has(error.code)) {
        void queryClient.invalidateQueries({ queryKey: keys.game(id) });
      }
    },
  });
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  const me = useMe();
  return useMutation({
    mutationFn: (data: ChallengeIn) => api.createChallenge(data),
    onSuccess: (challenge) => applyChallenge(queryClient, me.id, challenge),
  });
}

export function useRespond() {
  const queryClient = useQueryClient();
  const me = useMe();
  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: ChallengeResponse }) =>
      api.respond(id, response),
    onSuccess: (challenge) => applyChallenge(queryClient, me.id, challenge),
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.challenges }),
  });
}
