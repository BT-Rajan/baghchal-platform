import type { QueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { Transport } from '@/api/client';
import type { Api, Me } from '@/api/endpoints';

import { SessionStore, type SessionState } from './sessionStore';
import { tokenStoreFor, transportFor, usernameStoreFor, type TokenStore } from './tokenStore';

const SessionContext = createContext<SessionStore | null>(null);

export interface SessionProviderProps {
  baseUrl: string;
  queryClient: QueryClient;
  transport?: Transport;
  tokenStore?: TokenStore;
  usernameStore?: TokenStore;
  fetch?: typeof fetch;
  children: ReactNode;
}

/** Provides the session. Its options are read once, when it mounts. */
export function SessionProvider({ children, ...options }: SessionProviderProps) {
  const [store] = useState(() => {
    const transport = options.transport ?? transportFor();
    return new SessionStore({
      baseUrl: options.baseUrl,
      queryClient: options.queryClient,
      transport,
      tokenStore: options.tokenStore ?? tokenStoreFor(transport),
      usernameStore: options.usernameStore ?? usernameStoreFor(transport),
      ...(options.fetch && { fetch: options.fetch }),
    });
  });
  useEffect(() => {
    void store.restore();
  }, [store]);
  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;
}

export function useSessionStore(): SessionStore {
  const store = useContext(SessionContext);
  if (store === null) throw new Error('useSession must be used inside <SessionProvider>');
  return store;
}

/** The session's state, and the store to act on it. */
export function useSession(): { state: SessionState; session: SessionStore } {
  const session = useSessionStore();
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  return { state, session };
}

/** The username last signed in on this device (apps only), or null. */
export function useRememberedUsername(): string | null {
  const session = useSessionStore();
  return useSyncExternalStore(
    session.subscribe,
    session.rememberedUsername,
    session.rememberedUsername,
  );
}

export function useApi(): Api {
  return useSessionStore().api;
}

/** The signed-in user. Only for screens behind the signed-in route guard. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== 'signedIn') throw new Error('useMe needs a signed-in session');
  return state.user;
}
