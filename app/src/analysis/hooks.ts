import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';

/** A finished game's analysis: null until someone asks for one. */
export function useAnalysis(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.analysis(id),
    queryFn: async ({ signal }) => {
      try {
        return await api.analysis(id, signal);
      } catch (error) {
        if (isApiError(error, 'not_analysed')) return null;
        throw error;
      }
    },
    enabled,
  });
}

/** Ask the engine to review the game; it takes a few seconds. */
export function useAnalyse(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.analyse(id),
    onSuccess: (analysis) => queryClient.setQueryData(queryKeys.analysis(id), analysis),
  });
}
