import { ApiError, NETWORK_ERROR, NOT_AUTHENTICATED, TIMEOUT, errorFromBody } from './errors';
import type {
  Category,
  Challenge,
  ChallengeIn,
  ChallengeList,
  Game,
  LeaderboardEntry,
  Me,
  PlayerStatus,
  Profile,
  RegisterIn,
  Session,
} from './types';

export interface ClientOptions {
  baseUrl: string;
  /** Browsers authenticate with an HttpOnly cookie; apps with a bearer token. */
  transport: 'cookie' | 'bearer';
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST';
export type ChallengeResponse = 'accept' | 'decline' | 'cancel';

const segment = encodeURIComponent;

/** Typed access to the HTTP API (see the server's /docs). */
export class ApiClient {
  readonly transport: 'cookie' | 'bearer';
  private token: string | null = null;
  private onUnauthenticated: (() => void) | null = null;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ClientOptions) {
    this.transport = options.transport;
    this.fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  /** The bearer token, kept in memory only (apps persist it in secure storage). */
  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  /** Called when the server says the session is gone (401 `not_authenticated`). */
  setUnauthenticatedHandler(handler: (() => void) | null): void {
    this.onUnauthenticated = handler;
  }

  async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.transport === 'bearer' && this.token) headers.authorization = `Bearer ${this.token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetch(this.options.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: this.transport === 'cookie' ? 'include' : 'omit',
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? new ApiError(0, TIMEOUT, 'The request timed out.')
        : new ApiError(0, NETWORK_ERROR, 'Could not reach the server.');
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 204) return undefined as T;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    if (!response.ok) {
      const error = errorFromBody(response.status, data);
      if (error.status === 401 && error.code === NOT_AUTHENTICATED) {
        this.onUnauthenticated?.();
      }
      throw error;
    }
    return data as T;
  }

  // ── Accounts ──────────────────────────────────────────────────────────

  register(data: RegisterIn): Promise<{ status: 'accepted' }> {
    return this.request('POST', '/api/v1/auth/register', data);
  }

  verifyEmail(token: string): Promise<Session> {
    return this.request('POST', '/api/v1/auth/verify-email', { token, transport: this.transport });
  }

  login(login: string, password: string): Promise<Session> {
    return this.request('POST', '/api/v1/auth/login', {
      login,
      password,
      transport: this.transport,
    });
  }

  logout(): Promise<void> {
    return this.request('POST', '/api/v1/auth/logout');
  }

  requestPasswordReset(email: string): Promise<{ status: 'accepted' }> {
    return this.request('POST', '/api/v1/auth/password-reset', { email });
  }

  confirmPasswordReset(token: string, password: string): Promise<void> {
    return this.request('POST', '/api/v1/auth/password-reset/confirm', { token, password });
  }

  me(): Promise<Me> {
    return this.request('GET', '/api/v1/me');
  }

  // ── Lobby ─────────────────────────────────────────────────────────────

  searchPlayers(prefix: string, limit = 20): Promise<PlayerStatus[]> {
    return this.request('GET', `/api/v1/players?prefix=${segment(prefix)}&limit=${limit}`);
  }

  onlinePlayers(limit = 50): Promise<PlayerStatus[]> {
    return this.request('GET', `/api/v1/players/online?limit=${limit}`);
  }

  profile(username: string): Promise<Profile> {
    return this.request('GET', `/api/v1/players/${segment(username)}`);
  }

  challenges(): Promise<ChallengeList> {
    return this.request('GET', '/api/v1/challenges');
  }

  createChallenge(data: ChallengeIn): Promise<Challenge> {
    return this.request('POST', '/api/v1/challenges', data);
  }

  respond(challengeId: string, response: ChallengeResponse): Promise<Challenge> {
    return this.request('POST', `/api/v1/challenges/${segment(challengeId)}/${response}`);
  }

  // ── Games ─────────────────────────────────────────────────────────────

  activeGames(): Promise<Game[]> {
    return this.request('GET', '/api/v1/games');
  }

  game(id: string): Promise<Game> {
    return this.request('GET', `/api/v1/games/${segment(id)}`);
  }

  move(id: string, ply: number, move: string): Promise<Game> {
    return this.request('POST', `/api/v1/games/${segment(id)}/moves`, { ply, move });
  }

  resign(id: string): Promise<Game> {
    return this.request('POST', `/api/v1/games/${segment(id)}/resign`);
  }

  abort(id: string): Promise<Game> {
    return this.request('POST', `/api/v1/games/${segment(id)}/abort`);
  }

  claimAbandonment(id: string): Promise<Game> {
    return this.request('POST', `/api/v1/games/${segment(id)}/claim-abandonment`);
  }

  // ── Ratings ───────────────────────────────────────────────────────────

  leaderboard(category: Category, limit = 100): Promise<LeaderboardEntry[]> {
    return this.request('GET', `/api/v1/leaderboards/${category}?limit=${limit}`);
  }
}
