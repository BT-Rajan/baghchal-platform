/** Wording for reports and moderation. */
import type { ModPlayer, ReportReason } from '@/api/endpoints';

const REASONS: Record<ReportReason, string> = {
  cheating: 'Cheating',
  abuse: 'Abuse',
  username: 'Offensive name',
  other: 'Other',
};

export const REPORT_REASONS = (Object.keys(REASONS) as ReportReason[]).map((value) => ({
  value,
  label: REASONS[value],
}));

export function reasonLabel(reason: ReportReason): string {
  return REASONS[reason];
}

/** "8 January 2026, 12:00 UTC" */
export function dateTimeText(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${day}, ${time} UTC`;
}

/** Where a player stands, for moderators. */
export function standingText(
  player: Pick<ModPlayer, 'deleted' | 'banned' | 'suspended_until'>,
  now: number,
): string {
  if (player.deleted) return 'Deleted account';
  if (player.banned) return 'Banned';
  if (player.suspended_until !== null && Date.parse(player.suspended_until) > now) {
    return `Suspended until ${dateTimeText(player.suspended_until)}`;
  }
  return 'In good standing';
}

const ACTIONS: Record<ModPlayer['actions'][number]['action'], string> = {
  suspend: 'Suspended',
  unsuspend: 'Lifted the suspension',
  rename: 'Renamed',
  dismiss_report: 'Dismissed a report',
};

export function actionText(action: ModPlayer['actions'][number]): string {
  return `${ACTIONS[action.action]} · ${action.moderator ?? 'a former moderator'} · ${dateTimeText(action.created_at)}`;
}
