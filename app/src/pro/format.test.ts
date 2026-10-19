import type { Pairing, Room, Tournament } from '@/api/endpoints';

import {
  answerText,
  invitationText,
  isMine,
  pairingText,
  progressText,
  puzzlePrompt,
  roomText,
  shareLink,
  tournamentStatusText,
} from './format';

const ALICE = { id: 'a', username: 'alice' };
const BOB = { id: 'b', username: 'bob' };

const room = (overrides: Partial<Room> = {}): Room => ({
  code: 'abc',
  host: ALICE,
  time_control: '5+3',
  host_side: 'goat',
  status: 'open',
  game_id: null,
  expires_at: '2026-01-02T12:00:00Z',
  ...overrides,
});

const pairing = (overrides: Partial<Pairing> = {}): Pairing => ({
  id: 'p1',
  goat: ALICE,
  tiger: BOB,
  state: 'waiting',
  game_id: null,
  winner: null,
  ...overrides,
});

const tournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  code: 't1',
  name: 'Cup',
  host: ALICE,
  time_control: '5+3',
  max_players: 6,
  status: 'open',
  players: [ALICE, BOB],
  standings: [],
  pairings: [],
  created_at: '2026-01-01T12:00:00Z',
  ...overrides,
});

test('share links', () => {
  expect(shareLink('/room/abc', 'https://clawplay.in')).toBe('https://clawplay.in/room/abc');
  expect(shareLink('/room/abc', undefined)).toBe('/room/abc');
});

test('rooms', () => {
  expect(roomText(room())).toBe('5+3 casual game · you play goats');
  expect(roomText(room({ host_side: 'random' }))).toBe('5+3 casual game · sides drawn at random');
  expect(invitationText(room({ host_side: 'tiger' }))).toBe(
    'alice invites you to a 5+3 casual game. alice plays tigers; you play goats.',
  );
  expect(invitationText(room())).toBe(
    'alice invites you to a 5+3 casual game. alice plays goats; you play tigers.',
  );
  expect(invitationText(room({ host_side: 'random' }))).toBe(
    'alice invites you to a 5+3 casual game. Sides are drawn at random.',
  );
});

test('tournaments', () => {
  expect(tournamentStatusText(tournament())).toBe('Waiting for players: 2 of 6');
  const pairings = [pairing({ state: 'done', winner: BOB }), pairing({ id: 'p2' })];
  expect(tournamentStatusText(tournament({ status: 'running', pairings }))).toBe(
    '1 of 2 games played',
  );
  expect(tournamentStatusText(tournament({ status: 'finished', pairings }))).toBe(
    'Finished · 1 of 2 games played',
  );
  expect(pairingText(pairing())).toBe('alice (goats) v bob (tigers) · to play');
  expect(pairingText(pairing({ state: 'playing' }))).toBe(
    'alice (goats) v bob (tigers) · playing now',
  );
  expect(pairingText(pairing({ state: 'done', winner: BOB }))).toBe(
    'alice (goats) v bob (tigers) · won by bob',
  );
  expect(pairingText(pairing({ state: 'done' }))).toBe(
    'alice (goats) v bob (tigers) · won by nobody',
  );
  expect([isMine(pairing(), 'a'), isMine(pairing(), 'b'), isMine(pairing(), 'c')]).toEqual([
    true,
    true,
    false,
  ]);
});

test('the trainer', () => {
  const puzzle = {
    id: 'o001',
    kind: 'opening' as const,
    position: 'T3T/5/5/5/T3T g 20 0',
    side: 'goat' as const,
    legal_moves: ['c3'],
  };
  expect(puzzlePrompt(puzzle)).toBe('Goats to play: find the best move.');
  expect(puzzlePrompt({ ...puzzle, side: 'tiger' })).toBe('Tigers to play: find the best move.');
  const result = { correct: true, best: 'c3', solved: 1, total: 60, streak: 1 };
  expect(answerText(result)).toBe('Correct! That is the best move.');
  expect(answerText({ ...result, correct: false })).toBe('Not quite. The best move was c3.');
  expect(progressText(result)).toBe('Solved 1 of 60 · Streak 1');
});
