import type { Clocks, Side } from '@/api/types';

/**
 * Estimates the server's clock from the `server_time` stamped on game snapshots. Each sample
 * (device time on arrival minus server time) overstates the offset by the network delay, so
 * the smallest recent sample is the best estimate. It errs towards showing less time left,
 * never more.
 */
export class ClockSync {
  private samples: number[] = [];

  constructor(private readonly keep = 16) {}

  observe(serverTime: string, receivedAt: number): void {
    const sample = receivedAt - Date.parse(serverTime);
    if (!Number.isFinite(sample)) return;
    this.samples = [...this.samples.slice(-(this.keep - 1)), sample];
  }

  /** Device time minus server time, in milliseconds. */
  offset(): number {
    return this.samples.length ? Math.min(...this.samples) : 0;
  }

  serverNow(deviceNow: number): number {
    return deviceNow - this.offset();
  }
}

/** Time left on `side`'s clock at server time `serverNow`, for a snapshot taken at `serverTime`. */
export function remainingMs(
  clocks: Clocks,
  serverTime: string,
  side: Side,
  serverNow: number,
): number {
  const base = side === 'goat' ? clocks.goat_ms : clocks.tiger_ms;
  if (clocks.running !== side) return base;
  return Math.max(0, base - Math.max(0, serverNow - Date.parse(serverTime)));
}

/** `m:ss`, and tenths of a second under 10 seconds (`9.4`). */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) return (Math.floor(clamped / 100) / 10).toFixed(1);
  const total = Math.ceil(clamped / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
