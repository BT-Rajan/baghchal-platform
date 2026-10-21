/** Words and numbers for the lobby, profiles and leaderboards. */
import type { GameSummary, Level, Category, Challenge, Side, TimeControl } from '@/api/endpoints';
import { WEB_URL } from '@/config';
import { ratingChangeText } from '@/game/describe';
import { locale, mark, plural, t } from '@/i18n';

/** The time controls on offer: minutes+increment, and the sand clock. */
export const TIME_CONTROLS: readonly { label: TimeControl; category: Category }[] = [
  { label: '2+1', category: 'blitz' },
  { label: '3+2', category: 'blitz' },
  { label: '5+3', category: 'rapid' },
  { label: 'sand', category: 'sand' },
];

/** How the sand clock works, where a player picks it. */
export const SAND_CLOCK_TEXT = mark(
  'Sand clock: one minute each. The time you take is added to your opponent’s clock, and theirs to yours.',
);

/** "5+3", or "Sand clock" (the API calls it "sand"). Retired ones (10+5) read as they are. */
export function timeControlName(label: string): string {
  return label === 'sand' ? t('Sand clock') : label;
}

/** Players see Quick, Standard and Sand clock (shown with `t()`); the API keeps its names. */
export const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'blitz', label: mark('Quick') },
  { value: 'rapid', label: mark('Standard') },
  { value: 'sand', label: mark('Sand clock') },
];

export function categoryOf(timeControl: string): Category | undefined {
  return TIME_CONTROLS.find((tc) => tc.label === timeControl)?.category;
}

/**
 * The leaderboard to show first: the time control I have played most rated games in, or Quick
 * (also while my ratings load).
 */
export function defaultCategory(
  ratings: Readonly<Record<string, { games: number }>> | undefined,
): Category {
  let best: Category = 'blitz';
  let most = 0;
  for (const { value } of CATEGORIES) {
    const games = ratings?.[value]?.games ?? 0;
    if (games > most) {
      best = value;
      most = games;
    }
  }
  return best;
}

export function presenceText(player: { online: boolean; playing: boolean }): string {
  if (player.playing) return t('Playing');
  return player.online ? t('Online') : t('Offline');
}

/** Whether a player can be challenged right now (the server checks again). */
export function canChallenge(player: { online: boolean; playing: boolean }): boolean {
  return player.online && !player.playing;
}

/**
 * The full address of an in-app path, to share: this site's on the web, the website's
 * (`WEB_URL`) in the apps. Every share link in the app comes from here.
 */
export function shareLink(
  path: string,
  origin: string = (globalThis as { location?: { origin?: string } }).location?.origin ?? WEB_URL,
): string {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

/** The page that opens a challenge by link. */
export function linkPath(code: string): string {
  return `/c/${code}`;
}

/** "45 s", "12 min" or "23 h 5 min": how long is left, as precisely as it matters. */
export function durationText(seconds: number): string {
  if (seconds < 120) return t('{seconds} s', { seconds });
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t('{minutes} min', { minutes });
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest === 0
    ? t('{hours} h', { hours })
    : t('{hours} h {minutes} min', { hours, minutes: rest });
}

/** Whole seconds until `expiresAt`, never negative. */
export function secondsLeft(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
}

/**
 * Seconds left to answer a challenge at `nowMs` (the server's time as best we know it). Capped
 * at the challenge's whole lifetime, so an estimate slightly behind never shows more time than
 * there was.
 */
export function challengeSecondsLeft(challenge: Challenge, nowMs: number): number {
  const lifetime = secondsLeft(challenge.expires_at, Date.parse(challenge.created_at));
  return Math.min(lifetime, secondsLeft(challenge.expires_at, nowMs));
}

export function isOpen(challenge: Challenge, nowMs: number): boolean {
  return challenge.status === 'pending' && challengeSecondsLeft(challenge, nowMs) > 0;
}

const OTHER: Record<Exclude<Side, 'random'>, Exclude<Side, 'random'>> = {
  goat: 'tiger',
  tiger: 'goat',
};

/** "5+3 · rated match" or "Sand clock · casual · you play goats", from my point of view. */
export function challengeTerms(challenge: Challenge, myId: string): string {
  const time = timeControlName(challenge.time_control);
  if (challenge.rated) return t('{time} · rated match (2 games)', { time });
  const side = challenge.side ?? 'random';
  if (side === 'random') return t('{time} · casual · random sides', { time });
  const mine = challenge.challenger.id === myId ? side : OTHER[side];
  return mine === 'goat'
    ? t('{time} · casual · you play goats', { time })
    : t('{time} · casual · you play tigers', { time });
}

/** "18 Jan 2027", on the player's own calendar (their device's time zone). */
export function dayText(iso: string): string {
  return new Date(iso).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "Joined March 2026". */
export function joinedText(createdAt: string): string {
  const date = new Date(createdAt);
  return t('Joined {date}', {
    date: date.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }),
  });
}

/** Usernames contain only these characters, so anything else cannot match a prefix search. */
export function searchPrefix(text: string): string | null {
  const prefix = text.trim();
  return /^[A-Za-z0-9_-]{1,20}$/.test(prefix) ? prefix : null;
}

export const LEVELS: readonly { value: Level; label: string }[] = [
  { value: 'easy', label: mark('Easy') },
  { value: 'medium', label: mark('Medium') },
  { value: 'hard', label: mark('Hard') },
];

const OUTCOMES: Record<GameSummary['outcome'], string> = {
  won: mark('Won'),
  lost: mark('Lost'),
  drawn: mark('Drawn'),
  aborted: mark('Aborted'),
};

/** "Won · vs bob · 5+3 rated (+12) · 3 Oct 2026" for a player's game history. */
export function historyText(game: GameSummary): string {
  const opponent =
    game.computer === null
      ? game.opponent.username
      : t('the computer ({level})', { level: game.computer });
  const delta = ratingChangeText(game.rating_change);
  const values = {
    outcome: t(OUTCOMES[game.outcome]),
    opponent,
    time: timeControlName(game.time_control),
    date: dayText(game.finished_at),
  };
  if (delta === null) {
    return game.rated
      ? t('{outcome} · vs {opponent} · {time} rated · {date}', values)
      : t('{outcome} · vs {opponent} · {time} casual · {date}', values);
  }
  return game.rated
    ? t('{outcome} · vs {opponent} · {time} rated ({change}) · {date}', {
        ...values,
        change: delta,
      })
    : t('{outcome} · vs {opponent} · {time} casual ({change}) · {date}', {
        ...values,
        change: delta,
      });
}

/** "Looking for 1 more player"-style wording for the number already waiting. */
export function waitingText(count: number): string {
  if (count === 0) return t('Nobody is waiting for this game right now.');
  return plural(count, '{count} player is waiting.', '{count} players are waiting.');
}
