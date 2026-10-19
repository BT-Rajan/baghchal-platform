import { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { ApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { ApiError } from '@/api/errors';
import { cookieTokenStore, secureTokenStore } from '@/auth/token-store';

const web = Platform.OS === 'web';

export const api = new ApiClient({
  baseUrl: apiBaseUrl(process.env.EXPO_PUBLIC_API_URL, !__DEV__),
  transport: web ? 'cookie' : 'bearer',
});

export const tokenStore = web ? cookieTokenStore : secureTokenStore;

/** Retry only what may succeed on retry: no answer, or a server error. */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (failures >= 2) return false;
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, staleTime: 5_000 },
    mutations: { retry: false },
  },
});
