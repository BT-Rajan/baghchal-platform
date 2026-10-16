/** Words and numbers for the lobby, profiles and leaderboards. */
import type { Category, Challenge, Rating, Side, TimeControl } from '@/api/endpoints';

export const TIME_CONTROLS: readonly { label: TimeControl; category: Category }[] = [
  { label: '3+2', category: 'blitz' },
  { label: '5+3', category: 'blitz' },
  { label: '10+5', category: 'rapid' },
  { label: '15+10', category: 'rapid' },
];

export const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
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

/** Whole seconds until `expiresAt`, never negative. */
export function secondsLeft(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
}

/**
 * Seconds left to answer a challenge, by this device's clock. Capped at the challenge's whole
 * lifetime, so a clock slightly behind the server's never shows more time than there was.
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
