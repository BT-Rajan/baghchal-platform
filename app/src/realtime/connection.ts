/**
 * The app's one WebSocket (docs/realtime.md). It reconnects with backoff, pings to keep the
 * connection (and the user's presence) alive, and drops a connection that stops answering.
 *
 * Close codes: 4401 means the session ended, so it stops. Anything else (including 1003, 1009,
 * 4408, 4410 and 4429, or a dropped network) reconnects after a backoff.
 *
 * Apps pause the connection while in the background (the system would suspend it anyway) and
 * resume it when they return, so a player in the background does not show as online.
 */
import { PING, parseServerMessage, probeReply, type ServerMessage } from './protocol';
import { backoffDelay } from './backoff';

/** The parts of a WebSocket we use (the browser's and React Native's both fit). */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

export type OpenSocket = (url: string, headers: Record<string, string>) => SocketLike;

export type ConnectionStatus = 'connecting' | 'open' | 'waiting' | 'paused' | 'stopped';

export const PING_INTERVAL_MS = 25_000;
export const CLOSE_SIGNED_OUT = 4401;

export interface ConnectionOptions {
  url: string;
  /** Bearer token for the handshake (apps). Browsers send the session cookie by themselves. */
  token: () => string | null;
  onMessage: (message: ServerMessage) => void;
  /** Every successful open; `reconnected` is false only for the first. */
  onOpen?: (reconnected: boolean) => void;
  onStatus?: (status: ConnectionStatus) => void;
  /** The server closed with 4401: the session is over. */
  onSignedOut?: () => void;
  /**
   * The handshake was refused (HTTP 403 shows up as a close before opening). The session may
   * have ended; this should ask the server (`GET /me`), which signs out on a 401.
   */
  onRefused?: () => void;
  openSocket?: OpenSocket;
  random?: () => number;
}

const defaultOpenSocket: OpenSocket = (url, headers) => {
  // React Native accepts headers as a third argument; browsers have only two.
  const Socket = WebSocket as unknown as new (
    url: string,
    protocols?: string | string[],
    options?: { headers: Record<string, string> },
  ) => SocketLike;
  return Object.keys(headers).length > 0
    ? new Socket(url, undefined, { headers })
    : new Socket(url);
};

export class RealtimeConnection {
  private socket: SocketLike | null = null;
  private status: ConnectionStatus = 'stopped';
  private attempt = 0;
  private everOpened = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private heardSincePing = true;

  constructor(private readonly options: ConnectionOptions) {}

  getStatus(): ConnectionStatus {
    return this.status;
  }

  start(): void {
    if (this.status !== 'stopped') return;
    this.connect();
  }

  stop(): void {
    this.clearTimers();
    this.drop();
    this.setStatus('stopped');
  }

  /** Close the connection until `resume` (the app went to the background). */
  pause(): void {
    if (this.status === 'stopped' || this.status === 'paused') return;
    this.clearTimers();
    this.drop();
    this.setStatus('paused');
  }

  /** Connect now: after a pause, or instead of waiting out the backoff. */
  resume(): void {
    if (this.status !== 'paused' && this.status !== 'waiting') return;
    this.clearTimers();
    this.attempt = 0;
    this.connect();
  }

  private connect(): void {
    this.setStatus('connecting');
    const token = this.options.token();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    let opened = false;
    let socket: SocketLike;
    try {
      socket = (this.options.openSocket ?? defaultOpenSocket)(this.options.url, headers);
    } catch {
      this.retryLater();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      opened = true;
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      this.setStatus('open');
      this.startPinging();
      this.options.onOpen?.(reconnected);
    };
    socket.onmessage = (event) => {
      this.heardSincePing = true;
      const message = parseServerMessage(event.data);
      if (message === null) return;
      // Answered here and now, so the measured round trip is the network's, not the app's.
      if (message.type === 'probe') socket.send(probeReply(message.id));
      else this.options.onMessage(message);
    };
    socket.onerror = () => {}; // a close follows; that is where we act
    socket.onclose = (event) => {
      if (this.socket !== socket) return; // an old socket we already let go of
      this.socket = null;
      this.clearTimers();
      if (event.code === CLOSE_SIGNED_OUT) {
        this.setStatus('stopped');
        this.options.onSignedOut?.();
        return;
      }
      if (!opened) this.options.onRefused?.();
      this.retryLater();
    };
  }

  private startPinging(): void {
    this.heardSincePing = true;
    this.pingTimer = setInterval(() => {
      if (!this.heardSincePing) {
        // Nothing back since the last ping, not even a pong: the connection is dead.
        this.drop();
        this.clearTimers();
        this.retryLater();
        return;
      }
      this.heardSincePing = false;
      this.socket?.send(PING);
    }, PING_INTERVAL_MS);
  }

  private retryLater(): void {
    this.setStatus('waiting');
    const delay = backoffDelay(this.attempt, this.options.random);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  /** Close the current socket without reacting to its close event. */
  private drop(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  }

  private clearTimers(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.retryTimer = this.pingTimer = null;
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }
}

/** `http(s)://host/…` → `ws(s)://host/api/v1/ws`: https always becomes the encrypted wss. */
export function socketUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/v1/ws`;
  url.search = '';
  url.hash = '';
  return url.toString();
}
