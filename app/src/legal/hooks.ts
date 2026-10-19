/** The terms and privacy policy, as the server has them now. */
import { useQuery } from '@tanstack/react-query';

import type { LegalDocumentName } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';

/** The versions a sign-up agrees to: asked fresh, so an agreement is never to an old text. */
export function useLegalVersions() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.legalVersions,
    queryFn: ({ signal }) => api.legalVersions(signal),
    staleTime: 0,
  });
}

export function useLegalDocument(document: LegalDocumentName) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.legalDocument(document),
    queryFn: ({ signal }) => api.legalDocument(document, signal),
  });
}
