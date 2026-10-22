import { QueryClient } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { ME, fakeServer } from '../../tests/support/fakeServer';
import { memoryTokenStore } from '../../tests/support/memoryTokenStore';

import { SessionProvider, useApi, useMe, useRememberedUsername, useSession } from './session';

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

test('useMe gives the signed-in user, and refuses otherwise', async () => {
  const server = fakeServer({ 'GET /api/v1/me': { status: 200, body: ME } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider
      baseUrl="https://api.example"
      queryClient={new QueryClient()}
      transport="cookie"
      fetch={server.fetch}
    >
      {children}
    </SessionProvider>
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(renderHook(() => useMe(), { wrapper })).rejects.toThrow(/signed-in session/);
  jest.mocked(console.error).mockRestore();

  function Name() {
    const { state } = useSession();
    return state.status === 'signedIn' ? <Me /> : null;
  }
  function Me() {
    return <Text>{useMe().username}</Text>;
  }
  await render(<Name />, { wrapper });
  expect(await screen.findByText('alice')).toBeOnTheScreen();
});

test('useRememberedUsername gives the username last signed in here', async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionProvider
      baseUrl="https://api.example"
      queryClient={new QueryClient()}
      transport="bearer"
      tokenStore={memoryTokenStore()}
      usernameStore={memoryTokenStore('alice')}
    >
      {children}
    </SessionProvider>
  );
  const { result } = await renderHook(() => useRememberedUsername(), { wrapper });
  await waitFor(() => expect(result.current).toBe('alice'));
});
