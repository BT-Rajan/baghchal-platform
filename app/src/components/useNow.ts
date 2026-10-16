import { useEffect, useState } from 'react';

import { serverClock } from '@/game/serverClock';

/** The current time, re-read every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The server's current time, as best we can tell (see ServerClock), re-read every `intervalMs`. */
export function useServerNow(intervalMs = 1000): number {
  return useNow(intervalMs) + serverClock.offset();
}
