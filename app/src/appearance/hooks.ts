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

/** Save a choice, showing it at once and putting it back if the server refuses. */
export function useChooseAppearance() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: Appearance) => api.setAppearance(choice),
    onMutate: (choice) => {
      const before = queryClient.getQueryData<Appearance>(queryKeys.appearance);
      queryClient.setQueryData(queryKeys.appearance, choice);
      return { before };
    },
    onError: (_error, _choice, context) =>
      queryClient.setQueryData(queryKeys.appearance, context?.before),
    onSuccess: (saved) => queryClient.setQueryData(queryKeys.appearance, saved),
  });
}
