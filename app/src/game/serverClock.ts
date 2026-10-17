/**
 * An estimate of the server's clock, so countdowns agree with the server even when this
 * device's clock is off.
 *
 * Every timestamp the server sends (a game's `server_time`) was taken before we received it,
 * so `timestamp − local time at receipt` is a lower bound of the offset between the clocks.
 * The best estimate is the largest recent bound: the one that spent least time in transit.
 */
const WINDOW = 10;

export class ServerClock {
  private samples: number[] = [];

  constructor(private readonly localNow: () => number = Date.now) {}

  /** Record a server timestamp received just now. Ignores text that is not a timestamp. */
  observe(serverTime: string): void {
    const ms = Date.parse(serverTime);
    if (Number.isNaN(ms)) return;
    this.samples.push(ms - this.localNow());
    if (this.samples.length > WINDOW) this.samples.shift();
  }

  /** Milliseconds to add to local time to get server time (0 until a timestamp is seen). */
  offset(): number {
    return this.samples.length === 0 ? 0 : Math.max(...this.samples);
  }

  /** Forget everything heard so far. */
  reset(): void {
    this.samples = [];
  }

  now(): number {
    return this.localNow() + this.offset();
  }
}

export const serverClock = new ServerClock();
