import { ApiError } from './errors';

/** Retry policy for queries: network trouble and server errors, never the client's own mistakes. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return !(error instanceof ApiError && error.status >= 400 && error.status < 500);
}
