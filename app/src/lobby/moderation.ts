/** Wording for reports and moderation. */
import type { FairPlayFigures, ModPlayer, Report, ReportReason } from '@/api/endpoints';

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

/** Who filed a report: a player, or the automatic fair-play checks (no reporter). */
export function reporterText(report: Pick<Report, 'reporter'>): string {
  return report.reporter === null ? 'the automatic fair-play check' : report.reporter.username;
}

/** A report's headline in the queue. */
export function reportTitle(report: Pick<Report, 'reporter' | 'target'>): string {
  return report.reporter === null
    ? `Automatic fair-play check: ${report.target.username}`
    : `${report.reporter.username} reported ${report.target.username}`;
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
  grant: 'Granted',
  revoke: 'Revoked',
};

export function actionText(action: ModPlayer['actions'][number]): string {
  return `${ACTIONS[action.action]} · ${action.moderator ?? 'a former moderator'} · ${dateTimeText(action.created_at)}`;
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** "Engine's move in 92.0% of 120 decisive positions · average loss 12 · mistakes 0.5%" */
export function figuresText(f: FairPlayFigures): string {
  if (f.decisive === 0) return `No decisive positions in ${f.moves} moves`;
  return [
    `Engine's move in ${percent(f.agreement)} of ${f.decisive} decisive positions`,
    `average loss ${Math.round(f.average_loss)}`,
    `mistakes ${percent(f.mistake_rate)}`,
  ].join(' · ');
}

/** "Median 2.4 s per move · 3 under a second" */
export function thinkText(medianMs: number, fastMoves: number): string {
  return `Median ${(medianMs / 1000).toFixed(1)} s per move · ${fastMoves} under a second`;
}
