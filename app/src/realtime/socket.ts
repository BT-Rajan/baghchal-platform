import { CLOSE, parseServerMessage, type ServerMessage } from './protocol';

/** The parts of a WebSocket the client uses (the browser and React Native ones both fit). */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export type SocketFactory = (url: string, token: string | null) => SocketLike;

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface RealtimeOptions {
  url: string;
  createSocket: SocketFactory;
  getToken: () => string | null;
  onMessage: (message: ServerMessage) => void;
  onStatus?: (status: ConnectionStatus) => void;
  /** Connected again after losing the connection: events in between were missed. */
  onResync?: () => void;
  /** The server ended the session (close 4401). The client stops. */
  onSessionEnded?: () => void;
  /** The connection failed before the server said hello; the session may have ended. */
  onRefused?: () => void;
  scheduler?: Scheduler;
  random?: () => number;
}

export const PING_INTERVAL_MS = 25_000;
/** No frame at all for this long means the connection is dead even if it looks open. */
export const SILENCE_LIMIT_MS = 2 * PING_INTERVAL_MS + 5_000;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30_000;

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Full-jitter exponential backoff: spreads reconnects out after a server restart. */
export function backoffDelay(attempt: number, random: () => number): number {
  return Math.floor(random() * Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt));
}

/** One WebSocket to the server that keeps itself connected. */
export class RealtimeClient {
  private socket: SocketLike | null = null;
  private running = false;
  private attempt = 0;
  private everConnected = false;
  private greeted = false;
  private lastFrameAt = 0;
  private retryTimer: unknown = null;
  private pingTimer: unknown = null;
  private readonly scheduler: Scheduler;
  private readonly random: () => number;

  constructor(private readonly options: RealtimeOptions) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.random = options.random ?? Math.random;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.scheduler.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.drop();
    this.options.onStatus?.('offline');
  }

  /** Reconnect now instead of waiting out the backoff (the app came back to the foreground). */
  nudge(): void {
    if (!this.running || this.socket) return;
    this.scheduler.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  }

  private connect(): void {
    this.options.onStatus?.('connecting');
    this.greeted = false;
    const socket = this.options.createSocket(this.options.url, this.options.getToken());
    this.socket = socket;
    socket.onopen = () => {
      this.lastFrameAt = Date.now();
      this.pingTimer = this.scheduler.setInterval(() => this.heartbeat(), PING_INTERVAL_MS);
    };
    socket.onmessage = (event) => {
      this.lastFrameAt = Date.now();
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === 'hello') this.greet();
      this.options.onMessage(message);
    };
    socket.onclose = (event) => this.closed(socket, event.code);
    socket.onerror = () => undefined; // Always followed by onclose.
  }

  private greet(): void {
    this.greeted = true;
    this.attempt = 0;
    this.options.onStatus?.('online');
    if (this.everConnected) this.options.onResync?.();
    this.everConnected = true;
  }

  private heartbeat(): void {
    if (Date.now() - this.lastFrameAt > SILENCE_LIMIT_MS) {
      const socket = this.socket;
      this.drop();
      if (socket) this.closed(socket, 1006);
      return;
    }
    this.socket?.send(JSON.stringify({ type: 'ping' }));
  }

  private drop(): void {
    this.scheduler.clearInterval(this.pingTimer);
    this.pingTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
  }

  private closed(socket: SocketLike, code: number): void {
    if (this.socket === socket) this.drop();
    if (!this.running) return;
    if (code === CLOSE.sessionEnded) {
      this.running = false;
      this.options.onStatus?.('offline');
      this.options.onSessionEnded?.();
      return;
    }
    if (!this.greeted) this.options.onRefused?.();
    this.options.onStatus?.('offline');
    const delay = backoffDelay(this.attempt, this.random);
    this.attempt = Math.min(this.attempt + 1, 16);
    this.retryTimer = this.scheduler.setTimeout(() => {
      this.retryTimer = null;
      if (this.running) this.connect();
    }, delay);
  }
}
