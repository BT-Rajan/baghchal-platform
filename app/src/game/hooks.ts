/** A game's data, and the moves and actions that change it. The server's answer is the truth. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Game, GameAction } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { applyGame, isNewer } from '@/realtime/cache';

import { sideOf } from './describe';
import { serverClock } from './serverClock';

/**
 * Codes that mean "what you see is out of date": the game moved on, ended, or you raced
 * yourself on another device. Fetch the game again so the board shows what is true.
 */
const REFRESH_ON = [
  'stale_position',
  'not_your_turn',
  'game_over',
  'illegal_move',
  'invalid_move',
  'cannot_abort',
];

/** How often someone watching a game (not playing in it) fetches it: live events go only to
 * the two players. */
export const WATCH_REFRESH_MS = 3_000;

export function useGame(id: string, myId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useQuery<Game>({
    queryKey: queryKeys.game(id),
    refetchInterval: ({ state }) => {
      const game = state.data;
      const watching =
        game !== undefined && game.status === 'active' && sideOf(game, myId) === null;
      return watching ? WATCH_REFRESH_MS : false;
    },
    queryFn: async ({ signal }) => {
      const fresh = await api.game(id, signal);
      serverClock.observe(fresh.server_time);
      // A live event may have brought something newer while this request was out.
      const cached = queryClient.getQueryData<Game>(queryKeys.game(id));
      return cached === undefined || isNewer(fresh, cached) ? fresh : cached;
    },
  });
}

function useRefreshOnConflict(id: string) {
  const queryClient = useQueryClient();
  return (error: unknown) => {
    if (REFRESH_ON.some((code) => isApiError(error, code))) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.game(id) });
    }
  };
}

/** Play a move. `ply` is the number of moves the board showed when it was chosen. */
export function useMove(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ply, move }: { ply: number; move: string }) => api.move(id, ply, move),
    onSuccess: (game) => void applyGame(queryClient, game),
    onError: useRefreshOnConflict(id),
  });
}

export function useGameAction(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: GameAction) => api.gameAction(id, action),
    onSuccess: (game) => void applyGame(queryClient, game),
    onError: useRefreshOnConflict(id),
  });
}
