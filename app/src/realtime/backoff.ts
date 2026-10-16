export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 30_000;

/**
 * How long to wait before reconnect attempt `attempt` (0-based): exponential, capped, with
 * full jitter so that clients dropped together (a server restart) do not return together.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempt, 30));
  return Math.round(BACKOFF_BASE_MS / 2 + random() * (ceiling - BACKOFF_BASE_MS / 2));
}
