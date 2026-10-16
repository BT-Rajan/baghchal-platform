/** Renders the whole app (real routes and layout) against a fake server. */
import { renderRouter } from 'expo-router/testing-library';

import { fakeServer, type Route } from './fakeServer';

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

export const savedToken = () => mockSecure.get('session-token') ?? null;

export async function renderApp(
  url: string,
  { routes = {}, token = null }: { routes?: Record<string, Route>; token?: string | null } = {},
) {
  mockSecure.clear();
  if (token !== null) mockSecure.set('session-token', token);
  const server = fakeServer(routes);
  globalThis.fetch = server.fetch;
  const app = await renderRouter('./src/app', { initialUrl: url });
  return { server, app };
}
