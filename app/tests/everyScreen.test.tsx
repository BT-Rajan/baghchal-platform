/**
 * Every screen, in every language, as on Android, with something on it: none may crash. With
 * only the Intl the apps have (support/likeHermes.js), this is where a call that works on the
 * web but not on a phone shows up, whichever screen it hides in.
 */
import { act, screen } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { renderApp } from './support/app';
import { ME, type Route } from './support/fakeServer';
import { BOB, challenge, game } from './support/games';

import type { GameSummary, Notification, Tournament } from '@/api/endpoints';
import { FREE_APPEARANCE } from '@/appearance/catalog';
import { setLanguage, t, type Language } from '@/i18n';

// The device speaks the language under test (signed out, it is the one used).
let mockDeviceTags = ['en-IN'];
jest.mock('expo-localization', () => ({
  useLocales: () => mockDeviceTags.map((languageTag) => ({ languageTag })),
}));

const ALICE = { id: ME.id, username: 'alice' };
const now = () => new Date().toISOString();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

const PROFILE = (who: { id: string; username: string }) => ({
  ...who,
  online: true,
  playing: false,
  blocked: false,
  created_at: '2026-03-02T10:00:00Z',
  ratings: {
    blitz: { rating: 1612, deviation: 80, games: 23, provisional: false, rank: 3 },
    rapid: { rating: 1500, deviation: 350, games: 1, provisional: true, rank: null },
  },
});

const HISTORY: GameSummary[] = [0, 1, 2].map((i) => ({
  id: `h${i}`,
  opponent: BOB,
  side: i === 1 ? 'tiger' : 'goat',
  time_control: '5+3',
  rated: i === 0,
  computer: i === 2 ? 'easy' : null,
  result: { winner: 'goat', reason: 'resigned' },
  outcome: i === 1 ? 'lost' : 'won',
  rating_change: i === 0 ? 12 : null,
  moves: 10 + i,
  finished_at: new Date(Date.UTC(2026, 8 + i, 30 - i)).toISOString(),
}));

const ACHIEVEMENTS = [
  { key: 'first_win', earned_at: '2026-10-03T12:00:00Z' },
  { key: 'beat_hard', earned_at: null },
];

const NOTES: Notification[] = [
  {
    id: 'n1',
    kind: 'challenge',
    actor: BOB,
    detail: '5+3 rated',
    tournament: null,
    created_at: inSeconds(-300),
    read: false,
  },
  {
    id: 'n2',
    kind: 'tournament_started',
    actor: null,
    detail: null,
    tournament: { code: 'cup1', name: 'Friday cup' },
    created_at: inSeconds(-3 * 86400),
    read: true,
  },
];

const CUP: Tournament = {
  code: 'cup1',
  name: 'Friday cup',
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
};

const LIVE = game({ id: 'g1', server_time: now() });
const OVER = game({
  id: 'g2',
  status: 'finished',
  result: { winner: 'tiger', reason: 'five_captured' },
  legal_moves: [],
  server_time: now(),
});

/** A busy account: games played, a game on, challenges, notifications, friends. */
function busy(language: Language): Record<string, Route> {
  return {
    'GET /api/v1/me': { status: 200, body: ME },
    'GET /api/v1/me/appearance': { status: 200, body: { ...FREE_APPEARANCE, language } },
    'GET /api/v1/players/alice': { status: 200, body: PROFILE(ALICE) },
    'GET /api/v1/players/bob': { status: 200, body: PROFILE(BOB) },
    'GET /api/v1/players/alice/games': { status: 200, body: HISTORY },
    'GET /api/v1/players/bob/games': { status: 200, body: HISTORY },
    'GET /api/v1/players/alice/achievements': { status: 200, body: ACHIEVEMENTS },
    'GET /api/v1/players/bob/achievements': { status: 200, body: ACHIEVEMENTS },
    'GET /api/v1/players/online': {
      status: 200,
      body: [{ ...BOB, online: true, playing: false }],
    },
    'GET /api/v1/games': { status: 200, body: [LIVE] },
    'GET /api/v1/games/g1': { status: 200, body: LIVE },
    'GET /api/v1/games/g2': { status: 200, body: OVER },
    'GET /api/v1/challenges': {
      status: 200,
      body: {
        incoming: [challenge({ created_at: now(), expires_at: inSeconds(40) })],
        outgoing: [],
      },
    },
    'GET /api/v1/notifications': { status: 200, body: { unread: 1, items: NOTES } },
    'GET /api/v1/friends': {
      status: 200,
      body: { friends: [{ ...BOB, online: true, playing: false }], incoming: [], outgoing: [] },
    },
    'GET /api/v1/leaderboards/blitz': {
      status: 200,
      body: [{ rank: 1, player: BOB, rating: 1700, games: 30 }],
    },
    'GET /api/v1/tournaments': { status: 200, body: [CUP] },
    'GET /api/v1/tournaments/cup1': { status: 200, body: CUP },
    'GET /api/v1/seeks': { status: 200, body: [] },
  };
}

const SIGNED_IN = [
  '/',
  '/leaderboard',
  '/me',
  '/settings',
  '/settings/language',
  '/settings/account',
  '/settings/email',
  '/settings/password',
  '/settings/blocked',
  '/settings/data',
  '/settings/delete',
  '/appearance',
  '/ways-to-play',
  '/friends',
  '/puzzle',
  '/play',
  '/play?vs=computer',
  '/play?vs=person',
  '/invite',
  '/challenge/bob',
  '/player/bob',
  '/game/g1',
  '/game/g2',
  '/plans',
  '/tournaments',
  '/tournament/cup1',
  '/notifications',
  '/trainer',
  '/report/bob',
  '/delete-account',
  '/terms',
  '/privacy',
  '/make-it-yours',
];

const SIGNED_OUT = [
  '/start',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password?token=t',
  '/verify-email?token=t',
  '/c/abc123',
];

/** Lets the screen's requests answer and its effects run. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

let crashes: unknown[] = [];

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  crashes = [];
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (args[0] === 'Screen crashed') crashes.push(args[1]);
  });
});

afterEach(() => {
  mockDeviceTags = ['en-IN'];
  setLanguage('en');
  jest.restoreAllMocks();
});

describe.each<Language>(['ta', 'hi', 'ar', 'en'])('in %s', (language) => {
  test.each(SIGNED_IN)('%s', async (url) => {
    mockDeviceTags = [language];
    await renderApp(url, { token: 'tok', routes: busy(language) });
    await settle();
    expect(crashes).toEqual([]);
    expect(screen.queryByRole('heading', { name: t('Something went wrong') })).toBeNull();
  });

  test.each(SIGNED_OUT)('%s, signed out', async (url) => {
    mockDeviceTags = [language];
    await renderApp(url, {
      routes: { 'GET /api/v1/me': { status: 401, body: { detail: 'Not signed in.' } } },
    });
    await settle();
    expect(crashes).toEqual([]);
    expect(screen.queryByRole('heading', { name: t('Something went wrong') })).toBeNull();
  });
});
