/**
 * Messages on the WebSocket (docs/realtime.md). Everything the server sends is parsed
 * defensively: malformed JSON and unknown message types are ignored, never thrown.
 */
import type { Challenge, Game, Player } from '@/api/endpoints';

export type ServerMessage =
  | { type: 'hello'; user: Player }
  | { type: 'pong' }
  /** Answered at once by the connection: the server times the round trip, and does not
   * charge it to this player's clock. */
  | { type: 'probe'; id: number }
  | { type: 'challenge'; challenge: Challenge }
  | { type: 'game'; game: Game }
  /** My friends or friend requests changed: fetch them again. */
  | { type: 'friends' }
  | { type: 'error'; code: string; message: string };

export const PING = JSON.stringify({ type: 'ping' });

/** The answer to a probe: the same message, sent straight back. */
export function probeReply(id: number): string {
  return JSON.stringify({ type: 'probe', id });
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasId(value: unknown): value is Json & { id: string } {
  return isObject(value) && typeof value.id === 'string';
}

/** Enough of a challenge to file it: the cache keys on these fields. */
function isChallenge(value: unknown): value is Challenge {
  return (
    hasId(value) &&
    typeof value.status === 'string' &&
    hasId(value.challenger) &&
    (value.opponent === null || hasId(value.opponent))
  );
}

/** Enough of a game to order it against the one we have (see `isNewer`). */
function isGame(value: unknown): value is Game {
  return (
    hasId(value) &&
    typeof value.ply === 'number' &&
    typeof value.status === 'string' &&
    typeof value.server_time === 'string'
  );
}

export function parseServerMessage(text: unknown): ServerMessage | null {
  if (typeof text !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  switch (data.type) {
    case 'hello':
      return hasId(data.user) ? { type: 'hello', user: data.user as Player } : null;
    case 'pong':
      return { type: 'pong' };
    case 'probe':
      return Number.isSafeInteger(data.id) && (data.id as number) >= 0
        ? { type: 'probe', id: data.id as number }
        : null;
    case 'challenge':
      return isChallenge(data.challenge) ? { type: 'challenge', challenge: data.challenge } : null;
    case 'game':
      return isGame(data.game) ? { type: 'game', game: data.game } : null;
    case 'friends':
      return { type: 'friends' };
    case 'error':
      return typeof data.code === 'string' && typeof data.message === 'string'
        ? { type: 'error', code: data.code, message: data.message }
        : null;
    default:
      return null;
  }
}
