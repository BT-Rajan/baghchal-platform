import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ApiClient } from '@/api/client';
import { ApiError, NOT_AUTHENTICATED } from '@/api/errors';
import type { Me, Session } from '@/api/types';

import type { TokenStore } from './token-store';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: Me }
  | { status: 'unreachable'; error: unknown };

export interface SessionContextValue {
  state: SessionState;
  signIn(login: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  signOut(): Promise<void>;
  /** The session ended elsewhere (signed out, password reset): forget it locally. */
  expire(): void;
  retry(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  api: ApiClient;
  store: TokenStore;
  /** Clears whatever was cached for the previous user. */
  onSignedOut?: () => void;
  children: ReactNode;
}

export function SessionProvider({ api, store, onSignedOut, children }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const onSignedOutRef = useRef(onSignedOut);
  useEffect(() => {
    onSignedOutRef.current = onSignedOut;
  }, [onSignedOut]);

  const forget = useCallback(() => {
    api.setToken(null);
    setState({ status: 'signed-out' });
    onSignedOutRef.current?.();
    store.clear().catch(() => undefined);
  }, [api, store]);

  useEffect(() => {
    api.setUnauthenticatedHandler(forget);
    return () => api.setUnauthenticatedHandler(null);
  }, [api, forget]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        api.setToken(await store.get());
        const user = await api.me();
        if (!cancelled) setState({ status: 'signed-in', user });
      } catch (error) {
        // A 401 has already signed us out through the unauthenticated handler.
        if (cancelled || (error instanceof ApiError && error.code === NOT_AUTHENTICATED)) return;
        setState({ status: 'unreachable', error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, store, attempt]);

  const begin = useCallback(
    async (session: Session) => {
      if (session.token) {
        api.setToken(session.token);
        await store.set(session.token);
      }
      setState({ status: 'signed-in', user: session.user });
    },
    [api, store],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      signIn: async (login, password) => begin(await api.login(login, password)),
      verifyEmail: async (token) => begin(await api.verifyEmail(token)),
      signOut: async () => {
        try {
          await api.logout();
        } catch {
          // Signing out locally must work even when the server cannot be reached.
        }
        forget();
      },
      expire: forget,
      retry: () => {
        setState({ status: 'loading' });
        setAttempt((n) => n + 1);
      },
    }),
    [state, api, begin, forget],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/** The signed-in player. Only for screens behind the signed-in guard. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== 'signed-in') throw new Error('useMe needs a signed-in session');
  return state.user;
}
