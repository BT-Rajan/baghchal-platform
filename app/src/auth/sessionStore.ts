/**
 * The signed-in session: who the user is, and the API client that acts for them.
 *
 * On start, `restore()` asks the server (`GET /me`) whether a session exists. Whenever the
 * server says the session is over (`401 not_authenticated`), local state and the query cache
 * are cleared, and the route guards send the user back to sign-in. Whenever it says the terms
 * changed and must be accepted first (`403 consents_needed`), the user is asked again, so the
 * route guards show the agreement at once.
 *
 * It also keeps the username last signed in (or up) on this device, which outlives signing out
 * so the apps open sign-in with it filled in (see `usernameStore`).
 */
import type { QueryClient } from '@tanstack/react-query';

import { createClient, type Transport } from '@/api/client';
import { ApiError, BAD_RESPONSE, isApiError } from '@/api/errors';
import { createApi, type Agreement, type Api, type Me, type Session } from '@/api/endpoints';
import { t } from '@/i18n';

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
  /** Where the last username is kept (none: nothing is remembered). */
  usernameStore?: TokenStore;
  queryClient: QueryClient;
  fetch?: typeof fetch;
}

export class SessionStore {
  readonly api: Api;
  readonly transport: Transport;
  private state: SessionState = { status: 'loading' };
  private currentToken: string | null = null;
  private remembered: string | null = null;
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
      onConsentsNeeded: (epoch) => {
        // The request that was refused shows its own error; a failed refresh changes nothing.
        if (epoch === this.epoch) this.refresh().catch(() => {});
      },
    });
    this.api = createApi(client, options.transport);
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * The username last signed in (or up) on this device, once the session has been restored;
   * null if none (or a guest's only).
   */
  rememberedUsername = (): string | null => this.remembered;

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
      if (!session.token) throw new ApiError(200, BAD_RESPONSE, t('The server sent no token.'));
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

  /** Make an account: the server signs it in at once (its email is confirmed later, if ever). */
  async signUp(details: SignUpDetails): Promise<void> {
    await this.start(await this.api.register(details));
  }

  /** Sign in (or up) with a Google ID token, accepting the agreement by pressing the button. */
  async signInWithGoogle(idToken: string, agreement: Agreement): Promise<void> {
    await this.start(await this.api.googleSignIn(idToken, agreement));
  }

  /** Play at once without signing up: a guest account, which can be made a real one later. */
  async playAsGuest(agreement: Agreement): Promise<void> {
    await this.start(await this.api.playAsGuest(agreement));
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

  /** "Not you?": this device no longer offers the last username. */
  async forgetUsername(): Promise<void> {
    this.remembered = null;
    this.notify();
    await this.options.usernameStore?.clear();
  }

  /** The account was deleted: forget its session, and its username on this device. */
  async accountDeleted(): Promise<void> {
    await this.forget();
    await this.forgetUsername();
  }

  private async check(): Promise<void> {
    const epoch = this.epoch;
    const stale = () => this.epoch !== epoch;
    const [saved, remembered] = await Promise.all([
      read(this.options.tokenStore, 'session'),
      read(this.options.usernameStore, 'username'),
    ]);
    if (stale()) return;
    // Known before the state says "signed out", so the first screen is the right one.
    this.remembered = remembered;
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
    // Any account but a guest's (which has no password to sign in with) is remembered.
    if (state.status === 'signedIn' && state.user.role !== 'guest') {
      const { username } = state.user;
      if (username !== this.remembered) {
        this.remembered = username;
        this.options.usernameStore?.save(username).catch((error: unknown) => {
          console.warn('Could not remember the username', error);
        });
      }
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** What a sign-up sends: the account form's details (the endpoint adds the transport). */
export type SignUpDetails = Parameters<Api['register']>[0];

/** A saved text, or null when there is none or it cannot be read. */
async function read(store: TokenStore | undefined, what: string): Promise<string | null> {
  try {
    return (await store?.load()) ?? null;
  } catch (error) {
    console.warn(`Could not read the saved ${what}`, error);
    return null;
  }
}
