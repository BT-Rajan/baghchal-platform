import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { ApiClient } from '@/api/client';
import { socketUrl } from '@/api/config';
import { ClockSync } from '@/game/clock';

import { applyChallenge, applyGame, keys } from './cache';
import type { ServerMessage } from './protocol';
import { RealtimeClient, type ConnectionStatus, type SocketFactory } from './socket';

interface RealtimeContextValue {
  status: ConnectionStatus;
  clock: ClockSync;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export interface RealtimeProviderProps {
  api: ApiClient;
  /** The signed-in player's id; no connection while null. */
  me: string | null;
  createSocket: SocketFactory;
  /** Opens a game that just started (a challenge was accepted, or a match moved on). */
  onGameStarted: (gameId: string) => void;
  onSessionEnded: () => void;
  children: ReactNode;
}

/** Keeps the WebSocket open while signed in and feeds its events into the query cache. */
export function RealtimeProvider({
  api,
  me,
  createSocket,
  onGameStarted,
  onSessionEnded,
  children,
}: RealtimeProviderProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [clock] = useState(() => new ClockSync());
  const callbacks = useRef({ onGameStarted, onSessionEnded });
  useEffect(() => {
    callbacks.current = { onGameStarted, onSessionEnded };
  }, [onGameStarted, onSessionEnded]);

  useEffect(() => {
    if (!me) return;
    const handle = (message: ServerMessage) => {
      if (message.type === 'challenge') applyChallenge(queryClient, me, message.challenge);
      else if (message.type === 'game') {
        clock.observe(message.game.server_time, Date.now());
        if (applyGame(queryClient, message.game)) callbacks.current.onGameStarted(message.game.id);
      }
    };
    const client = new RealtimeClient({
      url: socketUrl(api.baseUrl),
      createSocket,
      getToken: () => api.getToken(),
      onMessage: handle,
      onStatus: setStatus,
      onResync: () => {
        // Events sent while we were away are not replayed: refetch what they would have changed.
        void queryClient.invalidateQueries({ queryKey: keys.challenges });
        void queryClient.invalidateQueries({ queryKey: keys.activeGames });
        void queryClient.invalidateQueries({ queryKey: ['game'] });
      },
      onSessionEnded: () => callbacks.current.onSessionEnded(),
      // A refused handshake looks like any other failure; /me tells us if the session ended
      // (a 401 there signs out through the API client).
      onRefused: () => void api.me().catch(() => undefined),
    });
    client.start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.nudge();
    });
    return () => {
      subscription.remove();
      client.stop();
    };
  }, [api, me, createSocket, queryClient, clock]);

  return <RealtimeContext.Provider value={{ status, clock }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return value;
}
