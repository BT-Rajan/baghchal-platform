import type { Pairing, Tournament } from '@/api/endpoints';

import {
  answerText,
  dailyStreakText,
  isMine,
  pairingText,
  roundsOf,
  progressText,
  puzzlePrompt,
  tournamentStatusText,
} from './format';

const ALICE = { id: 'a', username: 'alice' };
const BOB = { id: 'b', username: 'bob' };

const pairing = (overrides: Partial<Pairing> = {}): Pairing => ({
  id: 'p1',
  round: 1,
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
  round: 0,
  rounds: 0,
  standings: [],
  pairings: [],
  byes: [],
  created_at: '2026-01-01T12:00:00Z',
  ...overrides,
});

test('tournaments', () => {
  expect(tournamentStatusText(tournament())).toBe('Waiting for players: 2 of 6');
  const pairings = [
    pairing({ state: 'done', winner: BOB }),
    pairing({ id: 'p2', round: 2 }),
    pairing({ id: 'p3', round: 2, state: 'done', winner: ALICE }),
  ];
  const running = tournament({ status: 'running', round: 2, rounds: 3, pairings });
  expect(tournamentStatusText(running)).toBe('Round 2 of 3 · 1 of 2 games played');
  expect(tournamentStatusText({ ...running, status: 'finished' })).toBe('Finished after 2 rounds');
  expect(tournamentStatusText({ ...running, status: 'finished', round: 1 })).toBe(
    'Finished after 1 round',
  );
  const byes = [{ round: 1, player: ALICE }];
  expect(roundsOf({ ...running, byes })).toEqual([
    { round: 2, games: [pairings[1], pairings[2]], bye: null },
    { round: 1, games: [pairings[0]], bye: 'alice' },
  ]);
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

test('the daily streak', () => {
  expect(dailyStreakText(0)).toBeNull();
  expect(dailyStreakText(1)).toBe('Daily streak: 1 day');
  expect(dailyStreakText(12)).toBe('Daily streak: 12 days');
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
