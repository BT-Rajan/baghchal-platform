/** Lobby data: queries over the shared cache, and the actions that change it. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import type { Category, ChallengeAnswer, ChallengeRequest, Game } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { useApi, useMe } from '@/auth/session';
import { serverClock } from '@/game/serverClock';
import { applyChallenge, applyGame } from '@/realtime/cache';

/** Presence is not pushed over the socket, so lists of players are polled. */
export const PRESENCE_REFRESH_MS = 15_000;
/** Polling while an opponent seems to have left, so the claim is offered without much delay. */
export const AWAY_REFRESH_MS = 5_000;

export function useChallenges() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.challenges,
    queryFn: async ({ signal }) => {
      const lists = await api.challenges(signal);
      for (const c of [...lists.incoming, ...lists.outgoing]) serverClock.observe(c.created_at);
      return lists;
    },
  });
}

export function useActiveGames() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.activeGames,
    queryFn: ({ signal }) => api.activeGames(signal),
  });
}

export function useOnlinePlayers() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.onlinePlayers,
    queryFn: ({ signal }) => api.onlinePlayers(signal),
    refetchInterval: PRESENCE_REFRESH_MS,
  });
}

export function usePlayerSearch(prefix: string | null) {
  const api = useApi();
  const text = prefix ?? '';
  return useQuery({
    queryKey: queryKeys.playerSearch(text),
    queryFn: ({ signal }) => api.searchPlayers(text, signal),
    enabled: prefix !== null,
    refetchInterval: PRESENCE_REFRESH_MS,
  });
}

export function useProfile(username: string, enabled = true, refreshMs = PRESENCE_REFRESH_MS) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.profile(username),
    queryFn: ({ signal }) => api.profile(username, signal),
    refetchInterval: refreshMs,
    enabled,
  });
}

export function useLeaderboard(category: Category) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.leaderboard(category),
    queryFn: ({ signal }) => api.leaderboard(category, signal),
  });
}

/**
 * Open a game that has just started, unless it was already opened. Realtime events and the
 * answer to "accept" race to report a new game; whichever comes first opens it, once.
 */
export function useOpenStartedGame() {
  const queryClient = useQueryClient();
  return (game: Game) => {
    if (applyGame(queryClient, game).started) router.push(`/game/${game.id}`);
  };
}

export function useAnswerChallenge() {
  const api = useApi();
  const me = useMe();
  const queryClient = useQueryClient();
  const openStarted = useOpenStartedGame();
  return useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: ChallengeAnswer }) => {
      const challenge = await api.answerChallenge(id, answer);
      applyChallenge(queryClient, challenge, me.id);
      if (challenge.game_id) openStarted(await api.game(challenge.game_id));
      return challenge;
    },
    onError: (error) => {
      // Someone else got there first (cancelled, expired, already answered): show what is left.
      if (isApiError(error, 'challenge_closed') || isApiError(error, 'challenge_not_found')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.challenges });
      }
    },
  });
}

export function useCreateChallenge() {
  const api = useApi();
  const me = useMe();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ChallengeRequest) => api.challenge(request),
    onSuccess: (challenge) => applyChallenge(queryClient, challenge, me.id),
  });
}

/** A challenge by link, as whoever opened the link sees it. */
export function useLinkChallenge(code: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.linkChallenge(code),
    queryFn: async ({ signal }) => {
      const challenge = await api.linkChallenge(code, signal);
      serverClock.observe(challenge.created_at);
      return challenge;
    },
  });
}

/** Accept a challenge by link: the game starts at once and opens. */
export function useAcceptLink(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const openStarted = useOpenStartedGame();
  return useMutation({
    mutationFn: async () => {
      const challenge = await api.acceptLink(code);
      queryClient.setQueryData(queryKeys.linkChallenge(code), challenge);
      openStarted(await api.game(challenge.game_id!));
      return challenge;
    },
    // Someone else may have got there first: show the challenge as it is now.
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.linkChallenge(code) }),
  });
}

export function useAchievements(username: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.achievements(username),
    queryFn: ({ signal }) => api.achievements(username, signal),
  });
}

export function useNotifications() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => api.notifications(signal),
  });
}

export function useReadNotifications() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.readNotifications(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useFriends() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.friends, queryFn: ({ signal }) => api.friends(signal) });
}

/** Ask a player to be friends (or accept their request), or unfriend, decline or cancel. */
export function useFriendship() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, add }: { username: string; add: boolean }) => {
      if (add) await api.addFriend(username);
      else await api.removeFriend(username);
    },
    onSuccess: (_, { username }) =>
      Promise.all(
        [queryKeys.friends, queryKeys.profile(username)].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useBlocks() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.blocks, queryFn: ({ signal }) => api.blocks(signal) });
}

/** Block or unblock a player; the lists and profiles that depend on it are fetched again. */
export function useBlock() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, block }: { username: string; block: boolean }) =>
      block ? api.block(username) : api.unblock(username),
    onSuccess: (_, { username }) =>
      Promise.all(
        [
          queryKeys.blocks,
          queryKeys.profile(username),
          queryKeys.onlinePlayers,
          ['players', 'search'],
          queryKeys.challenges,
          queryKeys.friends,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}
