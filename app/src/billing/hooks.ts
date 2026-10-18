import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { GrantRequest } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';

export function usePlans() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.plans, queryFn: ({ signal }) => api.plans(signal) });
}

export function useMyPlan() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.myPlan, queryFn: ({ signal }) => api.myPlan(signal) });
}

/** For admins: a player's plan and every grant they have had. */
export function usePlayerPlan(username: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.playerPlan(username),
    queryFn: ({ signal }) => api.playerPlan(username, signal),
  });
}

/** Grant or revoke, then show the player's plan as it now is. */
export function useChangeGrant(username: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { grant: GrantRequest } | { revoke: string; reason: string }) =>
      'grant' in change
        ? api.grant(username, change.grant)
        : api.revokeGrant(change.revoke, change.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerPlan(username) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myPlan });
      // Grants and revocations are in the player's moderation history too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.modPlayer(username) });
    },
  });
}
