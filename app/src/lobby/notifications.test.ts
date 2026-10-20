import type { Notification } from '@/api/endpoints';

import { agoText, notificationLink, notificationText } from './notifications';

const ALICE = { id: 'a', username: 'alice' };
const note = (overrides: Partial<Notification>): Notification => ({
  id: 'n1',
  kind: 'challenge',
  actor: ALICE,
  detail: '5+3 rated',
  tournament: null,
  created_at: '2026-01-01T12:00:00Z',
  read: false,
  ...overrides,
});

test('what each notification says, and where it leads', () => {
  expect(notificationText(note({}))).toBe('alice challenged you to a 5+3 rated game.');
  expect(notificationText(note({ actor: null, detail: null }))).toBe(
    'A player challenged you to a game.',
  );
  expect(notificationText(note({ kind: 'friend_request' }))).toBe('alice wants to be friends.');
  expect(notificationText(note({ kind: 'friend_accepted' }))).toBe(
    'alice accepted your friend request.',
  );
  const cup = { code: 'cup1', name: 'Friday cup' };
  expect(notificationText(note({ kind: 'tournament_started', tournament: cup }))).toBe(
    'Friday cup has started: your games are ready.',
  );
  expect(notificationText(note({ kind: 'tournament_started' }))).toBe(
    'A tournament has started: your games are ready.',
  );
  expect(notificationText(note({ kind: 'tournament_round', tournament: cup }))).toBe(
    'New round in Friday cup: you play alice.',
  );
  expect(notificationText(note({ kind: 'tournament_round', actor: null }))).toBe(
    'New round in your tournament: you have the bye (a point).',
  );
  expect(notificationText(note({ kind: 'tournament_finished', tournament: cup }))).toBe(
    'Friday cup has ended: see the final standings.',
  );
  expect(notificationText(note({ kind: 'tournament_finished' }))).toBe(
    'A tournament has ended: see the final standings.',
  );
  expect(
    notificationText(note({ kind: 'tournament_round', actor: null, tournament: cup })),
  ).toMatch(/^New round in Friday cup: you have the bye/);
  expect(notificationText(note({ kind: 'tournament_round' }))).toBe(
    'New round in your tournament: you play alice.',
  );
  expect(notificationLink(note({ tournament: cup }))).toBe('/tournament/cup1');
  expect(notificationLink(note({}))).toBe('/player/alice');
  expect(notificationLink(note({ actor: null }))).toBeNull();
});

test('how long ago', () => {
  const at = Date.parse('2026-01-01T12:00:00Z');
  const ago = (ms: number) => agoText('2026-01-01T12:00:00Z', at + ms);
  expect(ago(30_000)).toBe('just now');
  expect(ago(5 * 60_000)).toBe('5 min ago');
  expect(ago(3 * 3_600_000)).toBe('3 h ago');
  expect(ago(24 * 3_600_000)).toBe('1 day ago');
  expect(ago(50 * 3_600_000)).toBe('2 days ago');
});
