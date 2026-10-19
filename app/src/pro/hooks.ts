import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TournamentRequest, TrainerKind } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { useOpenStartedGame } from '@/lobby/hooks';

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

/** Start one of my tournament games; it opens for both players. */
export function usePlayPairing(code: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const openStarted = useOpenStartedGame();
  return useMutation({
    mutationFn: (pairingId: string) => api.playPairing(code, pairingId),
    onSuccess: openStarted,
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

export function useAnswerPuzzle() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ id, move }: { id: string; move: string }) => api.answerPuzzle(id, move),
  });
}
