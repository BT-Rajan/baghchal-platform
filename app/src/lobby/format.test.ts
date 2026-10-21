import { ME } from '../../tests/support/fakeServer';
import { BOB, challenge } from '../../tests/support/games';

import {
  defaultCategory,
  LEVELS,
  historyText,
  waitingText,
  CATEGORIES,
  TIME_CONTROLS,
  canChallenge,
  challengeSecondsLeft,
  categoryOf,
  challengeTerms,
  isOpen,
  joinedText,
  presenceText,
  searchPrefix,
  timeControlName,
  secondsLeft,
  durationText,
  linkPath,
  shareLink,
} from './format';

test('time controls and categories', () => {
  expect(TIME_CONTROLS.map((tc) => tc.label)).toEqual(['2+1', '3+2', '5+3', 'sand']);
  expect(TIME_CONTROLS.map((tc) => timeControlName(tc.label))).toEqual([
    '2+1',
    '3+2',
    '5+3',
    'Sand clock',
  ]);
  expect(timeControlName('10+5')).toBe('10+5'); // retired, still shown in old games
  expect(CATEGORIES.map((c) => c.value)).toEqual(['blitz', 'rapid', 'sand']);
  expect(CATEGORIES.map((c) => c.label)).toEqual(['Quick', 'Standard', 'Sand clock']);
  expect(categoryOf('3+2')).toBe('blitz');
  expect(categoryOf('5+3')).toBe('rapid');
  expect(categoryOf('sand')).toBe('sand');
  expect(categoryOf('1+0')).toBeUndefined();
});

test('the leaderboard first shown: where I have played most', () => {
  expect(defaultCategory(undefined)).toBe('blitz');
  expect(defaultCategory({})).toBe('blitz');
  expect(defaultCategory({ sand: { games: 3 } })).toBe('sand');
  expect(defaultCategory({ blitz: { games: 2 }, rapid: { games: 5 }, sand: { games: 5 } })).toBe(
    'rapid',
  );
});

test('presence', () => {
  expect(presenceText({ online: true, playing: true })).toBe('Playing');
  expect(presenceText({ online: true, playing: false })).toBe('Online');
  expect(presenceText({ online: false, playing: false })).toBe('Offline');
  expect(canChallenge({ online: true, playing: false })).toBe(true);
  expect(canChallenge({ online: true, playing: true })).toBe(false);
  expect(canChallenge({ online: false, playing: false })).toBe(false);
});

test('secondsLeft and isOpen', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  expect(secondsLeft('2026-01-01T12:00:59.200Z', now)).toBe(60);
  expect(secondsLeft('2026-01-01T11:59:00Z', now)).toBe(0);
  expect(isOpen(challenge({ expires_at: '2026-01-01T12:00:30Z' }), now)).toBe(true);
  expect(isOpen(challenge({ expires_at: '2026-01-01T12:00:00Z' }), now)).toBe(false);
  expect(isOpen(challenge({ status: 'declined', expires_at: '2026-01-01T12:01:00Z' }), now)).toBe(
    false,
  );
});

test('challengeSecondsLeft never exceeds the challenge lifetime', () => {
  const c = challenge({ created_at: '2026-01-01T12:00:00Z', expires_at: '2026-01-01T12:01:00Z' });
  // This device's clock is two seconds behind the server's.
  expect(challengeSecondsLeft(c, Date.parse('2026-01-01T11:59:58Z'))).toBe(60);
  expect(challengeSecondsLeft(c, Date.parse('2026-01-01T12:00:30Z'))).toBe(30);
  expect(challengeSecondsLeft(c, Date.parse('2026-01-01T12:02:00Z'))).toBe(0);
});

describe('challengeTerms', () => {
  const me = { id: ME.id, username: ME.username };

  test('rated matches', () => {
    expect(challengeTerms(challenge({ rated: true, side: null }), ME.id)).toBe(
      '5+3 · rated match (2 games)',
    );
  });

  test('casual games, from either side', () => {
    expect(challengeTerms(challenge({ side: 'random' }), ME.id)).toBe(
      '5+3 · casual · random sides',
    );
    expect(challengeTerms(challenge({ side: null }), ME.id)).toBe('5+3 · casual · random sides');
    // Bob challenged me and plays goats, so I play tigers.
    expect(challengeTerms(challenge({ side: 'goat' }), ME.id)).toBe(
      '5+3 · casual · you play tigers',
    );
    expect(challengeTerms(challenge({ side: 'tiger' }), ME.id)).toBe(
      '5+3 · casual · you play goats',
    );
    // I challenged Bob and chose goats.
    const mine = challenge({ challenger: me, opponent: BOB, side: 'goat' });
    expect(challengeTerms(mine, ME.id)).toBe('5+3 · casual · you play goats');
  });
});

test('joinedText', () => {
  expect(joinedText('2026-03-31T23:59:00Z')).toBe('Joined March 2026');
});

test('searchPrefix', () => {
  expect(searchPrefix('  al ')).toBe('al');
  expect(searchPrefix('a_b-1')).toBe('a_b-1');
  expect(searchPrefix('')).toBeNull();
  expect(searchPrefix('a b')).toBeNull();
  expect(searchPrefix('%')).toBeNull();
  expect(searchPrefix('a'.repeat(21))).toBeNull();
});

test('history lines', () => {
  const base = {
    id: 'g1',
    opponent: BOB,
    side: 'goat' as const,
    time_control: '5+3',
    rated: true,
    computer: null,
    result: { winner: 'goat' as const, reason: 'five_captured' as const },
    outcome: 'won' as const,
    rating_change: 12,
    moves: 40,
    finished_at: '2026-10-03T12:00:00Z',
  };
  expect(historyText(base)).toBe('Won · vs bob · 5+3 rated (+12) · 3 Oct 2026');
  expect(
    historyText({ ...base, rated: false, rating_change: null, outcome: 'lost', computer: 'easy' }),
  ).toBe('Lost · vs the computer (easy) · 5+3 casual · 3 Oct 2026');
  expect(historyText({ ...base, outcome: 'aborted', rating_change: null })).toBe(
    'Aborted · vs bob · 5+3 rated · 3 Oct 2026',
  );
  expect(historyText({ ...base, outcome: 'drawn', rating_change: 0 })).toBe(
    'Drawn · vs bob · 5+3 rated (±0) · 3 Oct 2026',
  );
  expect(historyText({ ...base, rated: false, rating_change: 5 })).toBe(
    'Won · vs bob · 5+3 casual (+5) · 3 Oct 2026',
  );
});

test('waiting players and levels', () => {
  expect(waitingText(0)).toBe('Nobody is waiting for this game right now.');
  expect(waitingText(1)).toBe('1 player is waiting.');
  expect(waitingText(3)).toBe('3 players are waiting.');
  expect(LEVELS.map((l) => l.value)).toEqual(['easy', 'medium', 'hard']);
});

test('share links to challenges', () => {
  expect(linkPath('abc')).toBe('/c/abc');
  expect(shareLink('/c/abc', 'https://clawplay.in')).toBe('https://clawplay.in/c/abc');
  expect(shareLink('/c/abc', 'https://clawplay.in/')).toBe('https://clawplay.in/c/abc');
  // In the apps (no page address): the website's, from the build's settings.
  expect(shareLink('/c/abc')).toBe('http://localhost:8000/c/abc');
  // On the web: this site's own address.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    value: { origin: 'https://play.example' },
    configurable: true,
  });
  try {
    expect(shareLink('/c/abc')).toBe('https://play.example/c/abc');
  } finally {
    if (saved === undefined) delete (globalThis as { location?: unknown }).location;
    else Object.defineProperty(globalThis, 'location', saved);
  }
});

test('durationText', () => {
  expect(durationText(45)).toBe('45 s');
  expect(durationText(119)).toBe('119 s');
  expect(durationText(150)).toBe('3 min');
  expect(durationText(3600)).toBe('1 h');
  expect(durationText(86_400 - 61)).toBe('23 h 59 min');
});
