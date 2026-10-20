/** A game's data, and the moves and actions that change it. The server's answer is the truth. */
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Emote, Game, GameAction } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { addChatMessage, applyGame, isNewer, showEmote, type ShownEmote } from '@/realtime/cache';

import type { Piece } from './bfen';

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

/** The latest quick message in this game (mine or my opponent's), set by the realtime layer. */
export function useShownEmote(gameId: string) {
  return useQuery<ShownEmote | null>({
    queryKey: queryKeys.emote(gameId),
    queryFn: skipToken, // only ever set from messages, never fetched
  }).data;
}

/** Send a quick message to my opponent; it shows on my own bar too. */
export function useSendEmote(gameId: string, mine: Piece) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emote: Emote) => api.emote(gameId, emote),
    onSuccess: (_, emote) => showEmote(queryClient, gameId, mine, emote),
  });
}

/** A game's chat for one of its players (open or not, and what was said). */
export function useChat(gameId: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.chat(gameId),
    queryFn: ({ signal }) => api.chat(gameId, signal),
    enabled,
  });
}

/** Write in a game's chat; the message shows at once (the server's echo is not shown twice). */
export function useSendChat(gameId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.sendChat(gameId, text),
    onSuccess: (message) => addChatMessage(queryClient, gameId, message),
  });
}
