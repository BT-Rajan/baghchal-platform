import type { Challenge, Game } from '@/api/types';

/** Messages the server sends over the WebSocket (docs/realtime.md). */
export type ServerMessage =
  | { type: 'hello'; user: { id: string; username: string } }
  | { type: 'pong' }
  | { type: 'challenge'; challenge: Challenge }
  | { type: 'game'; game: Game }
  | { type: 'error'; code: string; message: string };

export const CLOSE = {
  unsupportedData: 1003,
  tooBig: 1009,
  sessionEnded: 4401,
  tooSlow: 4408,
  tooFast: 4429,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasId(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string';
}

/**
 * Parses a frame from the server. Returns null for anything malformed or unknown, so a bad or
 * newer-than-us message is skipped instead of breaking the connection.
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(message)) return null;
  switch (message.type) {
    case 'hello':
      return hasId(message.user) ? (message as ServerMessage) : null;
    case 'pong':
      return { type: 'pong' };
    case 'challenge':
      return hasId(message.challenge) ? (message as ServerMessage) : null;
    case 'game':
      return hasId(message.game) && typeof (message.game as Game).ply === 'number'
        ? (message as ServerMessage)
        : null;
    case 'error':
      return typeof message.code === 'string' ? (message as ServerMessage) : null;
    default:
      return null;
  }
}
