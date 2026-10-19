/** Renders the whole app (real routes and layout) against a fake server. */
import { renderRouter } from 'expo-router/testing-library';

import { FREE_APPEARANCE } from '@/appearance/catalog';
import { serverClock } from '@/game/serverClock';

import { fakeServer, type Route } from './fakeServer';
import { FakeSocket } from './fakeSocket';
import { FREE, PLANS } from './plans';

const mockSecure = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecure.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecure.delete(key);
  }),
}));

/** What a quiet lobby answers: no games, no challenges, nobody else online. */
export const QUIET_LOBBY: Record<string, Route> = {
  'GET /api/v1/games': { status: 200, body: [] },
  'GET /api/v1/challenges': { status: 200, body: { incoming: [], outgoing: [] } },
  'GET /api/v1/players/online': { status: 200, body: [] },
  // Profiles show game history; nobody has played yet unless a test says so.
  'GET /api/v1/players/alice/games': { status: 200, body: [] },
  'GET /api/v1/players/bob/games': { status: 200, body: [] },
  // Everyone is on the Free plan unless a test says otherwise.
  'GET /api/v1/me/plan': { status: 200, body: FREE },
  'GET /api/v1/plans': { status: 200, body: PLANS },
  // And on the free board, pieces and sounds.
  'GET /api/v1/me/appearance': { status: 200, body: FREE_APPEARANCE },
  // Payments are off unless a test turns them on.
  'GET /api/v1/me/payments': { status: 200, body: { enabled: false, payments: [] } },
};

export const savedToken = () => mockSecure.get('session-token') ?? null;

export async function renderApp(
  url: string,
  { routes = {}, token = null }: { routes?: Record<string, Route>; token?: string | null } = {},
) {
  mockSecure.clear();
  serverClock.reset();
  if (token !== null) mockSecure.set('session-token', token);
  const server = fakeServer({ ...QUIET_LOBBY, ...routes });
  globalThis.fetch = server.fetch;
  FakeSocket.reset();
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  const app = await renderRouter('./src/app', { initialUrl: url });
  return { server, app };
}
