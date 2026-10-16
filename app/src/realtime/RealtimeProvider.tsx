import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import type { Game } from '@/api/endpoints';
import { useSession } from '@/auth/session';

import { applyMessage, refetchAfterReconnect } from './cache';
import { RealtimeConnection, type ConnectionStatus, type OpenSocket } from './connection';

const StatusContext = createContext<ConnectionStatus>('stopped');

export interface RealtimeProviderProps {
  url: string;
  /** A game of mine just started: the app opens it. */
  onGameStarted?: (game: Game) => void;
  openSocket?: OpenSocket;
  children: ReactNode;
}

/** Keeps one WebSocket open while someone is signed in, and feeds its events into the cache. */
export function RealtimeProvider({
  url,
  onGameStarted,
  openSocket,
  children,
}: RealtimeProviderProps) {
  const { state, session } = useSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('stopped');
  const myId = state.status === 'signedIn' ? state.user.id : null;

  const gameStarted = useEffectEvent((game: Game) => onGameStarted?.(game));

  useEffect(() => {
    if (myId === null) return;
    const connection = new RealtimeConnection({
      url,
      token: () => session.token(),
      ...(openSocket && { openSocket }),
      onStatus: setStatus,
      onMessage: (message) => {
        const applied = applyMessage(queryClient, message, myId);
        if (applied.otherUser) void session.retry();
        if (applied.startedGame !== null) gameStarted(applied.startedGame);
      },
      onOpen: (reconnected) => {
        if (reconnected) void refetchAfterReconnect(queryClient);
      },
      onSignedOut: () => void session.forget(),
      // A 401 here signs out through the API client; any other failure just means "retry".
      onRefused: () => void session.api.me().catch(() => {}),
    });
    connection.start();
    const foreground = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') connection.wake();
    });
    return () => {
      foreground.remove();
      connection.stop();
    };
  }, [myId, url, openSocket, session, queryClient]);

  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}

/** Whether live updates are flowing: for a "reconnecting…" indicator. */
export function useRealtimeStatus(): ConnectionStatus {
  return useContext(StatusContext);
}
