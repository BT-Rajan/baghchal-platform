import type { Challenge, Game } from '@/api/endpoints';

import { ME } from './fakeServer';

export const BOB = { id: '00000000-0000-4000-8000-000000000002', username: 'bob' };
const ALICE = { id: ME.id, username: ME.username };

export function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
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
    legal_moves: ['a2'],
    clocks: { goat_ms: 300_000, tiger_ms: 300_000, running: null },
    ratings: { goat: { rating: 1500, change: null }, tiger: { rating: 1500, change: null } },
    match: null,
    computer: null,
    positions: [],
    deadline_at: null,
    server_time: '2026-01-01T12:00:00Z',
    created_at: '2026-01-01T12:00:00Z',
    finished_at: null,
    ...overrides,
  };
}

export function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    challenger: BOB,
    opponent: ALICE,
    time_control: '5+3',
    rated: false,
    side: 'random',
    status: 'pending',
    created_at: '2026-01-01T12:00:00Z',
    expires_at: '2026-01-01T12:01:00Z',
    game_id: null,
    ...overrides,
  };
}
