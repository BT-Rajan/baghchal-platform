import { QueryClient } from '@tanstack/react-query';

import type { Challenge, Game } from '@/api/types';

export const ALICE = { id: 'a1111111-0000-0000-0000-000000000000', username: 'alice' };
export const BOB = { id: 'b2222222-0000-0000-0000-000000000000', username: 'bob' };

export function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g0000000-0000-0000-0000-000000000001',
    goat: ALICE,
    tiger: BOB,
    time_control: '5+3',
    rated: false,
    status: 'active',
    result: null,
    position: 'T3T/5/5/5/T3T g 20 0',
    ply: 0,
    side_to_move: 'goat',
    moves: [],
    legal_moves: ['a2', 'b1'],
    clocks: { goat_ms: 300_000, tiger_ms: 300_000, running: null },
    ratings: { goat: { rating: 1500, change: null }, tiger: { rating: 1500, change: null } },
    match: null,
    deadline_at: null,
    server_time: '2026-10-19T10:00:00Z',
    created_at: '2026-10-19T10:00:00Z',
    finished_at: null,
    ...overrides,
  };
}

export function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c0000000-0000-0000-0000-000000000001',
    challenger: ALICE,
    opponent: BOB,
    time_control: '5+3',
    rated: false,
    side: 'random',
    status: 'pending',
    created_at: '2026-10-19T10:00:00Z',
    expires_at: '2026-10-19T10:01:00Z',
    game_id: null,
    ...overrides,
  };
}

/** A fetch stub answering with `status` and a JSON (or raw text) body. */
export function respond(status: number, body?: unknown, raw?: string): Response {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  return new Response(status === 204 ? null : text, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A QueryClient without retries or garbage-collection timers (which would keep Jest alive). */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}
