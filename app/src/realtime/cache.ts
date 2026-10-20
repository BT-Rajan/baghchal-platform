/** How realtime events update the query cache that screens read from. */
import type { QueryClient } from '@tanstack/react-query';

import type { Challenge, ChallengeList, Chat, ChatMessage, Emote, Game } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { serverClock } from '@/game/serverClock';

import type { ServerMessage } from './protocol';

/**
 * Whether `next` is a newer state of the same game than `current`. A higher ply is newer. At
 * the same ply (resigning, timing out and aborting do not add a move), a finished game beats an
 * active one, and otherwise the later `server_time` wins.
 */
export function isNewer(next: Game, current: Game | undefined): boolean {
  if (current === undefined) return true;
  if (next.ply !== current.ply) return next.ply > current.ply;
  if (next.status !== current.status) return next.status === 'finished';
  return Date.parse(next.server_time) > Date.parse(current.server_time);
}

function without(list: Challenge[], id: string): Challenge[] {
  return list.filter((c) => c.id !== id);
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  return index === -1 ? [...list, item] : list.map((x, i) => (i === index ? item : x));
}

/** File a challenge under incoming or outgoing while it is pending; drop it once it is not. */
export function applyChallenge(queryClient: QueryClient, challenge: Challenge, myId: string): void {
  serverClock.observe(challenge.created_at);
  queryClient.setQueryData<ChallengeList>(queryKeys.challenges, (lists) => {
    if (lists === undefined) return undefined; // nobody has loaded the lists yet
    const incoming = without(lists.incoming, challenge.id);
    const outgoing = without(lists.outgoing, challenge.id);
    if (challenge.status === 'pending') {
      if (challenge.opponent?.id === myId) incoming.push(challenge);
      else if (challenge.challenger.id === myId) outgoing.push(challenge);
    }
    return { incoming, outgoing };
  });
}

/**
 * Store a game state if it is newer than the cached one, and keep the list of live games in
 * step. Returns whether this is a game that has just started and that we had not seen: the app
 * opens those.
 */
export function applyGame(queryClient: QueryClient, game: Game): { started: boolean } {
  serverClock.observe(game.server_time);
  const key = queryKeys.game(game.id);
  const current = queryClient.getQueryData<Game>(key);
  if (!isNewer(game, current)) return { started: false };
  queryClient.setQueryData(key, game);
  if (current?.status === 'active' && game.status !== 'active') {
    // Over: the results, ratings and a Plus's games left changed, and chat closes soon.
    for (const k of [queryKeys.chat(game.id), queryKeys.myPlan, ['player-games'], ['player']])
      void queryClient.invalidateQueries({ queryKey: k });
  }
  queryClient.setQueryData<Game[]>(queryKeys.activeGames, (games) => {
    if (games === undefined) return undefined;
    if (game.status !== 'active') return games.filter((g) => g.id !== game.id);
    const listed = games.find((g) => g.id === game.id);
    return listed === undefined || isNewer(game, listed) ? upsert(games, game) : games;
  });
  return { started: current === undefined && game.status === 'active' && game.ply === 0 };
}

/** After a reconnect: events missed while offline are not replayed, so ask again. */
export function refetchAfterReconnect(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.challenges }),
    queryClient.invalidateQueries({ queryKey: queryKeys.friends }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activeGames }),
    queryClient.invalidateQueries({ queryKey: ['game'] }),
    queryClient.invalidateQueries({ queryKey: ['chat'] }),
  ]).then(() => undefined);
}

export interface Applied {
  /** A game of mine that just started (a challenge accepted, or game 2 of a match). */
  startedGame: Game | null;
  /** The socket belongs to someone else (another tab signed in as a different user). */
  otherUser: boolean;
}

/** A quick message on the game screen: who sent it, what, and when (it shows briefly). */
export interface ShownEmote {
  side: 'goat' | 'tiger';
  emote: Emote;
  at: number;
}

export function showEmote(
  queryClient: QueryClient,
  gameId: string,
  side: ShownEmote['side'],
  emote: Emote,
): void {
  queryClient.setQueryData<ShownEmote>(queryKeys.emote(gameId), { side, emote, at: Date.now() });
}

/**
 * Add a chat message to a game's chat, if it is loaded (it is fetched when the game opens; a
 * message for a game not on screen is read then). The same message twice (sent here, then
 * echoed by the server) is kept once.
 */
export function addChatMessage(queryClient: QueryClient, gameId: string, message: ChatMessage) {
  queryClient.setQueryData<Chat>(queryKeys.chat(gameId), (chat) => {
    if (chat === undefined) return chat;
    const seen = chat.messages.some(
      (m) => m.side === message.side && m.sent_at === message.sent_at && m.text === message.text,
    );
    return seen ? chat : { ...chat, messages: [...chat.messages, message] };
  });
}

/** Apply one server message to the cache. */
export function applyMessage(
  queryClient: QueryClient,
  message: ServerMessage,
  myId: string,
): Applied {
  const applied: Applied = { startedGame: null, otherUser: false };
  switch (message.type) {
    case 'hello':
      applied.otherUser = message.user.id !== myId;
      break;
    case 'challenge':
      applyChallenge(queryClient, message.challenge, myId);
      break;
    case 'game':
      if (applyGame(queryClient, message.game).started) applied.startedGame = message.game;
      break;
    case 'emote':
      showEmote(queryClient, message.game_id, message.side, message.emote);
      break;
    case 'chat':
      addChatMessage(queryClient, message.game_id, {
        side: message.side,
        text: message.text,
        sent_at: message.sent_at,
      });
      break;
    case 'notification':
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      break;
    case 'friends':
      // The lists, and how profiles show the friendship.
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      void queryClient.invalidateQueries({ queryKey: ['player'] });
      break;
    case 'error':
      console.warn('Realtime error from the server', message.code, message.message);
      break;
    case 'pong':
    case 'probe': // answered by the connection
      break;
  }
  return applied;
}
