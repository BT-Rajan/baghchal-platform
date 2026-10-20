import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Appearance } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';

import { FREE_APPEARANCE } from './catalog';

export function useAppearanceQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.appearance,
    queryFn: ({ signal }) => api.appearance(signal),
  });
}

/** My board, pieces and sounds: the free set until (or unless) the server says otherwise. */
export function useAppearance(): Appearance {
  return useAppearanceQuery().data ?? FREE_APPEARANCE;
}

/**
 * Change part of my appearance (what is left out stays as it was), showing it at once and
 * putting it back if the server refuses.
 */
export function useChooseAppearance() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: Partial<Appearance>) => api.changeAppearance(change),
    onMutate: (change) => {
      const before = queryClient.getQueryData<Appearance>(queryKeys.appearance);
      queryClient.setQueryData<Appearance>(queryKeys.appearance, {
        ...(before ?? FREE_APPEARANCE),
        ...change,
      });
      return { before };
    },
    onError: (_error, _choice, context) =>
      queryClient.setQueryData(queryKeys.appearance, context?.before),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.appearance, saved);
      void queryClient.invalidateQueries({ queryKey: ['chat'] }); // messages on or off: chat opens or closes
    },
  });
}
