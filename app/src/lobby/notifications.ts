/** Words and links for notifications. */
import type { Notification } from '@/api/endpoints';

import { timeControlName } from './format';

/** "alice challenged you to a 5+3 rated game." */
export function notificationText(n: Notification): string {
  const who = n.actor?.username ?? 'A player';
  switch (n.kind) {
    case 'challenge':
      return `${who} challenged you to a ${timeControlName(n.detail ?? '')} game.`.replace(
        '  ',
        ' ',
      );
    case 'friend_request':
      return `${who} wants to be friends.`;
    case 'friend_accepted':
      return `${who} accepted your friend request.`;
    case 'tournament_started':
      return `${n.tournament?.name ?? 'A tournament'} has started: your games are ready.`;
  }
}

/** Where a notification leads: the tournament, or the player; null if they are gone. */
export function notificationLink(n: Notification): string | null {
  if (n.tournament !== null) return `/tournament/${n.tournament.code}`;
  return n.actor === null ? null : `/player/${n.actor.username}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function agoText(iso: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
