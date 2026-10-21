/** Words and links for notifications. */
import type { Notification } from '@/api/endpoints';
import { plural, t } from '@/i18n';

import { timeControlName } from './format';

/** "alice challenged you to a 5+3 rated game." */
export function notificationText(n: Notification): string {
  const name = n.actor?.username ?? t('A player');
  switch (n.kind) {
    case 'challenge':
      return t('{name} challenged you to a {control} game.', {
        name,
        control: timeControlName(n.detail ?? ''),
      }).replace('  ', ' ');
    case 'friend_request':
      return t('{name} wants to be friends.', { name });
    case 'friend_accepted':
      return t('{name} accepted your friend request.', { name });
    case 'tournament_started':
      return t('{tournament} has started: your games are ready.', {
        tournament: n.tournament?.name ?? t('A tournament'),
      });
    case 'tournament_round':
      return n.actor === null
        ? t('New round in {tournament}: you have the bye (a point).', {
            tournament: n.tournament?.name ?? t('your tournament'),
          })
        : t('New round in {tournament}: you play {name}.', {
            tournament: n.tournament?.name ?? t('your tournament'),
            name: n.actor.username,
          });
    case 'tournament_finished':
      return t('{tournament} has ended: see the final standings.', {
        tournament: n.tournament?.name ?? t('A tournament'),
      });
  }
}

/** How long a challenge to a player stays open (the server's `CHALLENGE_TTL`). */
export const CHALLENGE_OPEN_MS = 60_000;

/**
 * Where a notification leads: a challenge to the lobby, where it is answered (and nowhere once
 * it has expired); the tournament; or the player. Null if there is nowhere to go.
 */
export function notificationLink(n: Notification, nowMs: number = Date.now()): string | null {
  if (n.kind === 'challenge') {
    return nowMs - Date.parse(n.created_at) < CHALLENGE_OPEN_MS ? '/' : null;
  }
  if (n.tournament !== null) return `/tournament/${n.tournament.code}`;
  return n.actor === null ? null : `/player/${n.actor.username}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function agoText(iso: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t('just now');
  if (minutes < 60) return plural(minutes, '{count} min ago', '{count} min ago');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, '{count} h ago', '{count} h ago');
  const days = Math.floor(hours / 24);
  return plural(days, '{count} day ago', '{count} days ago');
}
