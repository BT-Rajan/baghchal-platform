import type { SocketLike } from '@/realtime/connection';

/** A WebSocket stand-in that the test drives: open it, deliver messages, close it. */
export class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(
    readonly url: string,
    readonly headers: Record<string, string> = {},
  ) {
    FakeSocket.all.push(this);
  }

  static latest(): FakeSocket {
    const socket = FakeSocket.all.at(-1);
    if (socket === undefined) throw new Error('no socket opened');
    return socket;
  }

  static reset(): void {
    FakeSocket.all = [];
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  // Driven by tests:
  open(): void {
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  serverClose(code: number): void {
    this.onerror?.();
    this.onclose?.({ code });
  }
}

export const openFakeSocket = (url: string, headers: Record<string, string>) =>
  new FakeSocket(url, headers);
