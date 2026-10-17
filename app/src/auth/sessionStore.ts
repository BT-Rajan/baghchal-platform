/**
 * The signed-in session: who the user is, and the API client that acts for them.
 *
 * On start, `restore()` asks the server (`GET /me`) whether a session exists. Whenever the
 * server says the session is over (`401 not_authenticated`), local state and the query cache
 * are cleared, and the route guards send the user back to sign-in.
 */
import type { QueryClient } from '@tanstack/react-query';

import { createClient, type Transport } from '@/api/client';
import { ApiError, BAD_RESPONSE, isApiError } from '@/api/errors';
import { createApi, type Api, type Me, type Session } from '@/api/endpoints';

import type { TokenStore } from './tokenStore';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: Me }
  /** The server could not be asked whether we are signed in. */
  | { status: 'unreachable'; error: unknown };

export interface SessionStoreOptions {
  baseUrl: string;
  transport: Transport;
  tokenStore: TokenStore;
  queryClient: QueryClient;
  fetch?: typeof fetch;
}

export class SessionStore {
  readonly api: Api;
  readonly transport: Transport;
  private state: SessionState = { status: 'loading' };
  private currentToken: string | null = null;
  /** Changes with every session, so answers that arrive late for an old one are ignored. */
  private epoch = 0;
  private restoring: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: SessionStoreOptions) {
    this.transport = options.transport;
    const client = createClient({
      baseUrl: options.baseUrl,
      transport: options.transport,
      ...(options.fetch && { fetch: options.fetch }),
      auth: () => ({ token: this.currentToken, epoch: this.epoch }),
      onSignedOut: (epoch) => {
        if (epoch === this.epoch) void this.forget();
      },
    });
    this.api = createApi(client, options.transport);
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The session token (apps only), for the WebSocket handshake. */
  token(): string | null {
    return this.currentToken;
  }

  /** Find out whether a session exists. Concurrent calls share one check. */
  restore(): Promise<void> {
    this.restoring ??= this.check().finally(() => {
      this.restoring = null;
    });
    return this.restoring;
  }

  /** Ask again after the server was unreachable. */
  retry(): Promise<void> {
    this.set({ status: 'loading' });
    return this.restore();
  }

  /** Start a session from a server response (signing in, or verifying an email address). */
  async start(session: Session): Promise<void> {
    if (this.transport === 'bearer') {
      if (!session.token) throw new ApiError(200, BAD_RESPONSE, 'The server sent no token.');
      await this.options.tokenStore.save(session.token);
      this.currentToken = session.token;
    }
    this.epoch += 1;
    this.options.queryClient.clear();
    this.set({ status: 'signedIn', user: session.user });
  }

  async signIn(login: string, password: string): Promise<void> {
    await this.start(await this.api.login(login.trim(), password));
  }

  async signOut(): Promise<void> {
    try {
      await this.api.logout();
    } catch {
      // Offline, or the session had already ended: forget it here regardless.
    }
    await this.forget();
  }

  /** Ask who we are again, after the account changed (a new email address). */
  async refresh(): Promise<void> {
    if (this.state.status !== 'signedIn') return;
    const epoch = this.epoch;
    const user = await this.api.me();
    if (epoch === this.epoch) this.set({ status: 'signedIn', user });
  }

  /** Forget the session locally, without telling the server (it has already ended it). */
  async forget(): Promise<void> {
    this.epoch += 1;
    this.currentToken = null;
    this.options.queryClient.clear();
    this.set({ status: 'signedOut' });
    await this.options.tokenStore.clear();
  }

  private async check(): Promise<void> {
    const epoch = this.epoch;
    const stale = () => this.epoch !== epoch;
    let saved: string | null;
    try {
      saved = await this.options.tokenStore.load();
    } catch (error) {
      console.warn('Could not read the saved session', error);
      saved = null;
    }
    if (stale()) return;
    if (this.transport === 'bearer' && saved === null) {
      this.set({ status: 'signedOut' });
      return;
    }
    this.currentToken = saved;
    try {
      const user = await this.api.me();
      if (!stale()) this.set({ status: 'signedIn', user });
    } catch (error) {
      // A 401 has already signed us out (and moved the epoch on).
      if (!stale() && !isApiError(error, 'not_authenticated')) {
        this.set({ status: 'unreachable', error });
      }
    }
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
