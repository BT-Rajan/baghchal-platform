/**
 * The one HTTP client. It sets the base URL, JSON, credentials (a cookie on web, a bearer
 * token in apps) and a timeout, and turns every failure into an `ApiError`.
 */
import { language } from '@/i18n';

import { ApiError, BAD_RESPONSE, NETWORK_ERROR, TIMEOUT, errorFromBody } from './errors';

export type Transport = 'cookie' | 'bearer';
export type Query = Record<string, string | number | boolean | undefined>;

export interface Auth {
  token: string | null;
  /** Changes whenever the session does, so late answers to old sessions can be told apart. */
  epoch: number;
}

export interface ClientOptions {
  baseUrl: string;
  transport: Transport;
  auth: () => Auth;
  /** Called when the server says the session is over (`401 not_authenticated`). */
  onSignedOut: (epoch: number) => void;
  /** Called when the server refuses until changed terms are accepted (`403 consents_needed`). */
  onConsentsNeeded: (epoch: number) => void;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  body?: unknown;
  query?: Query | undefined;
  signal?: AbortSignal | undefined;
}

export interface Client {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, options?: RequestOptions): Promise<T>;
  put<T>(path: string, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

export function buildUrl(baseUrl: string, path: string, query: Query = {}): string {
  const params = Object.entries(query)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  const base = baseUrl.replace(/\/+$/, '');
  return params.length > 0 ? `${base}${path}?${params.join('&')}` : `${base}${path}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createClient(options: ClientOptions): Client {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const { token, epoch } = options.auth();
    // Error messages come back in the app's language.
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': language(),
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.transport === 'bearer' && token !== null) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', forwardAbort);

    let response: Response;
    let body: unknown;
    try {
      response = await doFetch(buildUrl(options.baseUrl, path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? null : JSON.stringify(opts.body),
        credentials: options.transport === 'cookie' ? 'include' : 'omit',
        signal: controller.signal,
      });
      body = await readJson(response);
    } catch (error) {
      if (timedOut) throw new ApiError(0, TIMEOUT, 'Request timed out.');
      if (opts.signal?.aborted) throw error; // cancelled by the caller: not an error to show
      throw new ApiError(0, NETWORK_ERROR, 'Network request failed.');
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', forwardAbort);
    }

    if (!response.ok) {
      const error = errorFromBody(response.status, body);
      if (error.code === 'not_authenticated') options.onSignedOut(epoch);
      if (error.code === 'consents_needed') options.onConsentsNeeded(epoch);
      throw error;
    }
    if (body === undefined && response.status !== 204) {
      throw new ApiError(response.status, BAD_RESPONSE, 'Expected a JSON body.');
    }
    return body as T;
  }

  return {
    get: (path, opts = {}) => request('GET', path, opts),
    post: (path, opts = {}) => request('POST', path, opts),
    put: (path, opts = {}) => request('PUT', path, opts),
    patch: (path, opts = {}) => request('PATCH', path, opts),
    delete: (path, opts = {}) => request('DELETE', path, opts),
  };
}
