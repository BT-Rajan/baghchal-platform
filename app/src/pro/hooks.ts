import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TournamentRequest, TrainerKind } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';

/** How often an open tournament page looks for new players, games and results. */
export const TOURNAMENT_REFRESH_MS = 5_000;

export function useTournaments() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: ({ signal }) => api.tournaments(signal),
  });
}

export function useTournament(code: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.tournament(code),
    queryFn: ({ signal }) => api.tournament(code, signal),
    refetchInterval: TOURNAMENT_REFRESH_MS,
  });
}

export function useCreateTournament() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TournamentRequest) => api.createTournament(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
  });
}

export function useTournamentAction(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: 'join' | 'leave' | 'start' | 'finish') =>
      api.tournamentAction(code, action),
    onSuccess: (tournament) => {
      queryClient.setQueryData(queryKeys.tournament(code), tournament);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    },
  });
}

/** The host gives an unplayed game to the player who turned up. */
export function useAwardPairing(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pairingId, winner }: { pairingId: string; winner: 'goat' | 'tiger' }) =>
      api.awardPairing(code, pairingId, winner),
    onSuccess: (tournament) => queryClient.setQueryData(queryKeys.tournament(code), tournament),
  });
}

/**
 * Ask my opponent to play one of my tournament games now: a challenge they accept like any
 * other, which opens the game for both of us.
 */
export function usePlayPairing(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pairingId: string) => api.playPairing(code, pairingId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.tournament(code) }),
  });
}

export function useTrainer(kind: TrainerKind) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.trainer(kind),
    queryFn: ({ signal }) => api.trainer(kind, signal),
  });
}

/** Today's puzzle: the same for everyone, on every plan. */
export function useDailyPuzzle() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.dailyPuzzle,
    queryFn: ({ signal }) => api.dailyPuzzle(signal),
  });
}

export function useAnswerPuzzle() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ id, move }: { id: string; move: string }) => api.answerPuzzle(id, move),
  });
}
