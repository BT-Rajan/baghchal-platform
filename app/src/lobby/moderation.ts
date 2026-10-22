/** Wording for reports and moderation. */
import type { FairPlayFigures, ModPlayer, Report, ReportReason } from '@/api/endpoints';
import { mark, plural, t } from '@/i18n';
import { dateText, timeText } from '@/i18n/format';

const REASONS: Record<ReportReason, string> = {
  cheating: mark('Cheating'),
  abuse: mark('Abuse'),
  username: mark('Offensive name'),
  other: mark('Other'),
};

/** The reasons a player can give (each label shown with `t()`). */
export const REPORT_REASONS = (Object.keys(REASONS) as ReportReason[]).map((value) => ({
  value,
  label: REASONS[value],
}));

export function reasonLabel(reason: ReportReason): string {
  return t(REASONS[reason]);
}

/** Who filed a report: a player, or the automatic fair-play checks (no reporter). */
export function reporterText(report: Pick<Report, 'reporter'>): string {
  return report.reporter === null ? t('the automatic fair-play check') : report.reporter.username;
}

/** A report's headline in the queue. */
export function reportTitle(report: Pick<Report, 'reporter' | 'target'>): string {
  return report.reporter === null
    ? t('Automatic fair-play check: {name}', { name: report.target.username })
    : t('{reporter} reported {name}', {
        reporter: report.reporter.username,
        name: report.target.username,
      });
}

/** "8 January 2026, 12:00 UTC" */
export function dateTimeText(iso: string): string {
  const date = new Date(iso);
  return t('{date}, {time} UTC', {
    date: dateText(date, { month: 'long', utc: true }),
    time: timeText(date, { utc: true }),
  });
}

/** Whether a player's suspension is still running at `now`. */
export function isSuspended(player: Pick<ModPlayer, 'suspended_until'>, now: number): boolean {
  return player.suspended_until !== null && Date.parse(player.suspended_until) > now;
}

/** Where a player stands, for moderators. */
export function standingText(
  player: Pick<ModPlayer, 'deleted' | 'banned' | 'suspended_until'>,
  now: number,
): string {
  if (player.deleted) return t('Deleted account');
  if (player.banned) return t('Banned');
  if (isSuspended(player, now)) {
    return t('Suspended until {date}', { date: dateTimeText(player.suspended_until!) });
  }
  return t('In good standing');
}

const ACTIONS: Record<ModPlayer['actions'][number]['action'], string> = {
  suspend: mark('Suspended'),
  unsuspend: mark('Lifted the suspension'),
  rename: mark('Renamed'),
  dismiss_report: mark('Dismissed a report'),
  grant: mark('Granted'),
  revoke: mark('Revoked'),
};

export function actionText(action: ModPlayer['actions'][number]): string {
  return t('{action} · {moderator} · {date}', {
    action: t(ACTIONS[action.action]),
    moderator: action.moderator ?? t('a former moderator'),
    date: dateTimeText(action.created_at),
  });
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** "Engine's move in 92.0% of 120 decisive positions · average loss 12 · mistakes 0.5%" */
export function figuresText(f: FairPlayFigures): string {
  if (f.decisive === 0) {
    return plural(
      f.moves,
      'No decisive positions in {count} move',
      'No decisive positions in {count} moves',
    );
  }
  return plural(
    f.decisive,
    "Engine's move in {share} of {count} decisive position · average loss {loss} · mistakes {mistakes}",
    "Engine's move in {share} of {count} decisive positions · average loss {loss} · mistakes {mistakes}",
    {
      share: percent(f.agreement),
      loss: Math.round(f.average_loss),
      mistakes: percent(f.mistake_rate),
    },
  );
}

/** "Median 2.4 s per move · 3 under a second" */
export function thinkText(medianMs: number, fastMoves: number): string {
  return t('Median {seconds} s per move · {count} under a second', {
    seconds: (medianMs / 1000).toFixed(1),
    count: fastMoves,
  });
}
