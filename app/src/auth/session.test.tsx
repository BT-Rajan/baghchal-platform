import { QueryClient } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { ME, fakeServer } from '../../tests/support/fakeServer';
import { memoryTokenStore } from '../../tests/support/memoryTokenStore';

import { SessionProvider, useApi, useSession } from './session';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

function Status() {
  const { state } = useSession();
  return <Text>{state.status === 'signedIn' ? `in:${state.user.username}` : state.status}</Text>;
}

test('restores the session on mount and re-renders on changes', async () => {
  const server = fakeServer({ 'GET /api/v1/me': { status: 200, body: ME } });
  await render(
    <SessionProvider
      baseUrl="https://api.example"
      queryClient={new QueryClient()}
      transport="cookie"
      fetch={server.fetch}
    >
      <Status />
    </SessionProvider>,
  );
  expect(await screen.findByText('in:alice')).toBeOnTheScreen();
});

test('defaults to the platform transport and token store', async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider baseUrl="https://api.example" queryClient={new QueryClient()}>
      {children}
    </SessionProvider>
  );
  const { result } = await renderHook(() => useSession(), { wrapper });
  expect(result.current.session.transport).toBe('bearer');
  // No token saved in the (mocked) secure store: signed out without a request.
  await waitFor(() => expect(result.current.state).toEqual({ status: 'signedOut' }));
});

test('useApi gives the session API', async () => {
  const tokens = memoryTokenStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider
      baseUrl="https://api.example"
      queryClient={new QueryClient()}
      transport="bearer"
      tokenStore={tokens}
    >
      {children}
    </SessionProvider>
  );
  const { result } = await renderHook(() => ({ api: useApi(), session: useSession().session }), {
    wrapper,
  });
  expect(result.current.api).toBe(result.current.session.api);
});

test('the hooks need the provider', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(renderHook(() => useSession())).rejects.toThrow(/inside <SessionProvider>/);
  jest.mocked(console.error).mockRestore();
});
