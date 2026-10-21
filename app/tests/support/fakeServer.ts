/** A stand-in for the server: answers `fetch` calls from a table of routes, and records them. */

export interface FakeRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  credentials: string | undefined;
  body: unknown;
}

export interface Reply {
  status: number;
  body?: unknown;
  /** Raw response text, instead of `body` as JSON. */
  text?: string;
}

export type Route = Reply | ((request: FakeRequest) => Reply | Promise<Reply>);

export function error(status: number, code: string, message = code, fields?: unknown): Reply {
  return { status, body: { error: { code, message, ...(fields !== undefined && { fields }) } } };
}

/** The versions of the terms and privacy policy the server has now. */
export const LEGAL = { terms: '2026-10-20', privacy: '2026-10-20' };

/** What a form sends for someone who accepts the current texts. */
export const AGREED = {
  terms_version: '2026-10-20',
  privacy_version: '2026-10-20',
};

export function fakeServer(routes: Record<string, Route> = {}) {
  // Every sign-up form asks for the current versions.
  const table = new Map<string, Route>(
    Object.entries({ 'GET /api/v1/legal': { status: 200, body: LEGAL }, ...routes }),
  );
  const requests: FakeRequest[] = [];

  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url);
    const request: FakeRequest = {
      method: init.method ?? 'GET',
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams.entries()),
      headers: { ...(init.headers as Record<string, string>) },
      credentials: init.credentials,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const route = table.get(`${request.method} ${request.path}`);
    const reply: Reply =
      route === undefined
        ? error(404, 'not_found', `No route for ${request.method} ${request.path}`)
        : typeof route === 'function'
          ? await route(request)
          : route;
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: async () => text,
    } as Response;
  });

  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    requests,
    /** Add or replace a route. */
    on(key: string, route: Route) {
      table.set(key, route);
    },
    /** The last request to `"METHOD /path"`. */
    lastTo(key: string): FakeRequest {
      const request = requests.findLast((r) => `${r.method} ${r.path}` === key);
      if (request === undefined) throw new Error(`no request to ${key}`);
      return request;
    },
    last(): FakeRequest {
      const request = requests.at(-1);
      if (request === undefined) throw new Error('no requests yet');
      return request;
    },
  };
}

export const ME = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'alice',
  email: 'alice@example.com',
  created_at: '2026-01-01T12:00:00Z',
  role: 'player' as const,
  consents_needed: [] as ('terms' | 'privacy')[],
};

/** A well-formed emailed-link token (43 URL-safe characters). */
export const LINK_TOKEN = 'a'.repeat(43);
