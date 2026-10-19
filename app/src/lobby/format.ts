/** Words and numbers for the lobby, profiles and leaderboards. */
import type {
  GameSummary,
  Level,
  Category,
  Challenge,
  Rating,
  Side,
  TimeControl,
} from '@/api/endpoints';
import { ratingChangeText } from '@/game/describe';

export const TIME_CONTROLS: readonly { label: TimeControl; category: Category }[] = [
  { label: '3+2', category: 'blitz' },
  { label: '5+3', category: 'blitz' },
  { label: '10+5', category: 'rapid' },
  { label: '15+10', category: 'rapid' },
];

/** Players see Quick and Standard; the API keeps its names, blitz and rapid. */
export const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'blitz', label: 'Quick' },
  { value: 'rapid', label: 'Standard' },
];

export function categoryOf(timeControl: string): Category | undefined {
  return TIME_CONTROLS.find((tc) => tc.label === timeControl)?.category;
}

/** A rating, with "?" while it is provisional (still settling). */
export function ratingText(rating: Pick<Rating, 'rating' | 'provisional'>): string {
  return `${rating.rating}${rating.provisional ? '?' : ''}`;
}

export function presenceText(player: { online: boolean; playing: boolean }): string {
  if (player.playing) return 'Playing';
  return player.online ? 'Online' : 'Offline';
}

/** Whether a player can be challenged right now (the server checks again). */
export function canChallenge(player: { online: boolean; playing: boolean }): boolean {
  return player.online && !player.playing;
}

/** A link to share, on the web; elsewhere just the path. Every share link in the app comes from here. */
export function shareLink(
  path: string,
  origin: string | undefined = (globalThis as { location?: { origin?: string } }).location?.origin,
): string {
  return origin === undefined ? path : `${origin}${path}`;
}

/** The page that opens a challenge by link. */
export function linkPath(code: string): string {
  return `/c/${code}`;
}

/** "45 s", "12 min" or "23 h 5 min": how long is left, as precisely as it matters. */
export function durationText(seconds: number): string {
  if (seconds < 120) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest === 0 ? '' : ` ${rest} min`}`;
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

const SIDE_NAMES: Record<Exclude<Side, 'random'>, string> = { goat: 'goats', tiger: 'tigers' };
const OTHER: Record<Exclude<Side, 'random'>, Exclude<Side, 'random'>> = {
  goat: 'tiger',
  tiger: 'goat',
};

/** "5+3 · rated match" or "10+5 · casual · you play goats", from my point of view. */
export function challengeTerms(challenge: Challenge, myId: string): string {
  const parts = [challenge.time_control];
  if (challenge.rated) {
    parts.push('rated match (2 games)');
  } else {
    parts.push('casual');
    const side = challenge.side ?? 'random';
    if (side === 'random') parts.push('random sides');
    else {
      const mine = challenge.challenger.id === myId ? side : OTHER[side];
      parts.push(`you play ${SIDE_NAMES[mine]}`);
    }
  }
  return parts.join(' · ');
}

/** "Joined March 2026". */
export function joinedText(createdAt: string): string {
  const date = new Date(createdAt);
  return `Joined ${date.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

/** Usernames contain only these characters, so anything else cannot match a prefix search. */
export function searchPrefix(text: string): string | null {
  const prefix = text.trim();
  return /^[A-Za-z0-9_-]{1,20}$/.test(prefix) ? prefix : null;
}

export const LEVELS: readonly { value: Level; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const OUTCOMES: Record<GameSummary['outcome'], string> = {
  won: 'Won',
  lost: 'Lost',
  aborted: 'Aborted',
};

/** "Won · vs bob · 5+3 rated (+12) · 3 Oct 2026" for a player's game history. */
export function historyText(game: GameSummary): string {
  const opponent =
    game.computer === null ? game.opponent.username : `the computer (${game.computer})`;
  const kind = game.rated ? 'rated' : 'casual';
  const delta = ratingChangeText(game.rating_change);
  const change = delta === null ? '' : ` (${delta})`;
  const day = new Date(game.finished_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${OUTCOMES[game.outcome]} · vs ${opponent} · ${game.time_control} ${kind}${change} · ${day}`;
}

/** "Looking for 1 more player"-style wording for the number already waiting. */
export function waitingText(count: number): string {
  if (count === 0) return 'Nobody is waiting for this game right now.';
  return count === 1 ? '1 player is waiting.' : `${count} players are waiting.`;
}
