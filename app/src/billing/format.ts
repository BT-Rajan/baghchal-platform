/** Words for plans, features, prices and grants. */
import type { Feature, Grant, MyPlan, PaidPlan, Plan, PlanInfo } from '@/api/endpoints';
import { language, locale, mark, plural, t } from '@/i18n';
import { dayText } from '@/lobby/format';

export const PLAN_NAMES: Record<Plan, string> = { free: mark('Free'), plus: 'Plus', pro: 'Pro' };

/** A plan's name as shown on its own: "Free" in the player's language, "Plus" or "Pro". */
export function planName(plan: Plan): string {
  return plan === 'free' ? t(PLAN_NAMES.free) : PLAN_NAMES[plan];
}

export const FEATURE_LABELS: Record<Feature, string> = {
  computer_hard: mark('Play the Hard computer'),
  full_history: mark('Your whole game history'),
  analysis: mark('The engine’s review of your finished games'),
  themes: mark('Board and coin themes, and sound packs'),
  badge: mark('A badge next to your name'),
  tournaments: mark('Host small tournaments'),
  trainer: mark('Opening and endgame trainer'),
};

export function featureText(feature: Feature): string {
  return t(FEATURE_LABELS[feature]);
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString(language() === 'en' ? 'en-IN' : locale(), { maximumFractionDigits: 2 })}`;
}

/** "45 games or a month", "A month or a year", or "Always" (Free). */
export function lastsText(plan: PlanInfo): string {
  if (plan.monthly_paise === null) return t('Always');
  if (plan.games !== null)
    return plural(plan.games, '{count} game or a month', '{count} games or a month');
  return plan.yearly_paise === null ? t('A month') : t('A month or a year');
}

/** "₹299 a month · ₹2,990 a year", "₹149 for 45 games or a month", or "Free for everyone". */
export function priceText(plan: PlanInfo): string {
  if (plan.monthly_paise === null) return t('Free for everyone');
  const price = rupees(plan.monthly_paise);
  if (plan.games !== null)
    return plural(
      plan.games,
      '{price} for {count} game or a month',
      '{price} for {count} games or a month',
      { price },
    );
  return plan.yearly_paise === null
    ? t('{price} a month', { price })
    : t('{price} a month · {yearly} a year', { price, yearly: rupees(plan.yearly_paise) });
}

/** " Then ClawPlay Plus until 30 Jan 2028.": plan time lined up after the current plan. */
function thenText(mine: MyPlan): string {
  const ends = new Map<Plan, string>();
  for (const g of mine.waiting)
    if (g.plan !== null && g.plan !== mine.plan && g.ends_at !== null) ends.set(g.plan, g.ends_at);
  return [...ends]
    .map(
      ([plan, end]) =>
        ` ${t('Then ClawPlay {plan} until {date}.', { plan: PLAN_NAMES[plan], date: dayText(end) })}`,
    )
    .join('');
}

/**
 * "You have ClawPlay Plus until 18 Jan 2027." / "You are on the Free plan." — or, for an admin
 * looking at a player, "alice has ClawPlay Plus…" / "alice is on the Free plan." Plan time
 * waiting its turn follows: "… Then ClawPlay Plus until 30 Jan 2028."
 */
export function myPlanText(mine: MyPlan, who: string | null = null): string {
  return `${planSentence(mine, who)}${thenText(mine)}`;
}

/** The first sentence of myPlanText, whole, for each case. */
function planSentence(mine: MyPlan, who: string | null): string {
  const name = who ?? '';
  if (mine.plan === 'free')
    return who === null
      ? t('You are on the Free plan.')
      : t('{name} is on the Free plan.', { name });
  const values = { name, plan: PLAN_NAMES[mine.plan] };
  const until = mine.plan_until;
  if (mine.games_left !== null) {
    const count = mine.games_left;
    if (until === null)
      return who === null
        ? plural(
            count,
            'You have ClawPlay {plan} for up to {count} more game at the latest.',
            'You have ClawPlay {plan} for up to {count} more games at the latest.',
            values,
          )
        : plural(
            count,
            '{name} has ClawPlay {plan} for up to {count} more game at the latest.',
            '{name} has ClawPlay {plan} for up to {count} more games at the latest.',
            values,
          );
    const dated = { ...values, date: dayText(until) };
    return who === null
      ? plural(
          count,
          'You have ClawPlay {plan} for up to {count} more game until {date} at the latest.',
          'You have ClawPlay {plan} for up to {count} more games until {date} at the latest.',
          dated,
        )
      : plural(
          count,
          '{name} has ClawPlay {plan} for up to {count} more game until {date} at the latest.',
          '{name} has ClawPlay {plan} for up to {count} more games until {date} at the latest.',
          dated,
        );
  }
  if (until === null)
    return who === null
      ? t('You have ClawPlay {plan}.', values)
      : t('{name} has ClawPlay {plan}.', values);
  const dated = { ...values, date: dayText(until) };
  return who === null
    ? t('You have ClawPlay {plan} until {date}.', dated)
    : t('{name} has ClawPlay {plan} until {date}.', dated);
}

/**
 * "ClawPlay Pro · until 18 Jan 2027 · given by boss: Welcome gift", or for a bought plan
 * "ClawPlay Plus · until 17 Nov 2026 · Paid ₹149 for a month (pay_…)"; time waiting for a
 * better plan to end reads "from 18 Jan 2027 until 17 Feb 2027".
 */
export function grantText(grant: Grant, now: number = Date.now()): string {
  const what =
    grant.plan !== null
      ? `ClawPlay ${PLAN_NAMES[grant.plan]}`
      : grant.feature !== null
        ? t(FEATURE_LABELS[grant.feature])
        : t('Access');
  const when =
    grant.revoked_at !== null
      ? t('revoked {date}', { date: dayText(grant.revoked_at) })
      : grant.ends_at === null
        ? t('until revoked')
        : Date.parse(grant.starts_at) > now
          ? t('from {start} until {end}', {
              start: dayText(grant.starts_at),
              end: dayText(grant.ends_at),
            })
          : grant.active
            ? t('until {date}', { date: dayText(grant.ends_at) })
            : t('ended {date}', { date: dayText(grant.ends_at) });
  const games =
    grant.games_left === null
      ? ''
      : ` · ${plural(grant.games_left, '{count} game left', '{count} games left')}`;
  const reason = grant.reason;
  return grant.paid
    ? `${what} · ${when}${games} · ${reason}`
    : `${what} · ${when} · ${
        grant.granted_by === null
          ? t('given by a former admin: {reason}', { reason })
          : t('given by {name}: {reason}', { name: grant.granted_by, reason })
      }`;
}

/** One line of the plans' comparison: what it is, and what each plan has of it. */
export interface ComparisonRow {
  label: string;
  /** Per plan, in the server's order: "✓", "—", or what it has ("5 a day"). */
  cells: string[];
}

/** What every plan has, then each feature: the plans side by side, from the server's plans. */
export function comparisonRows(plans: readonly PlanInfo[]): ComparisonRow[] {
  const all = (label: string) => ({ label, cells: plans.map(() => '✓') });
  return [
    { label: t('How long it lasts'), cells: plans.map(lastsText) },
    all(t('Live and rated games, quick pairing')),
    all(t('The Easy and Medium computer')),
    all(t('The daily puzzle')),
    ...(Object.keys(FEATURE_LABELS) as Feature[]).map((feature) => ({
      label: t(FEATURE_LABELS[feature]),
      cells: plans.map((plan) => {
        if (!plan.features.includes(feature))
          return feature === 'full_history' ? t('30 days') : '—';
        if (feature === 'analysis' && plan.analyses_per_day !== null)
          return t('{count} a day', { count: plan.analyses_per_day });
        return '✓';
      }),
    })),
  ];
}

/** "2 months free" when paid for a year, or null (Free, or no saving). */
export function yearlySaving(plan: PlanInfo): string | null {
  if (plan.monthly_paise === null || plan.yearly_paise === null) return null;
  const months = Math.round(12 - plan.yearly_paise / plan.monthly_paise);
  if (months < 1) return null;
  return plural(
    months,
    '{count} month free when you pay for a year',
    '{count} months free when you pay for a year',
  );
}

/** The cheapest paid plan that includes a feature (plans as the server lists them, cheapest
 * first), or null if none does. */
export function planFor(plans: readonly PlanInfo[], feature: Feature): PaidPlan | null {
  const found = plans.find(
    (p): p is PlanInfo & { plan: PaidPlan } => p.plan !== 'free' && p.features.includes(feature),
  );
  return found?.plan ?? null;
}

export function has(mine: MyPlan | undefined, feature: Feature): boolean {
  return mine?.features.includes(feature) ?? false;
}

/** What an admin can grant: a whole plan, or one feature (its label to show with `t()`). */
export const GRANTABLE: readonly { value: string; label: string }[] = [
  { value: 'plus', label: 'Plus' },
  { value: 'pro', label: 'Pro' },
  ...(Object.keys(FEATURE_LABELS) as Feature[]).map((f) => ({
    value: `feature:${f}`,
    label: FEATURE_LABELS[f],
  })),
];

/** The request body for a GRANTABLE choice. */
export function grantBody(choice: string): { plan: Plan } | { feature: Feature } {
  return choice.startsWith('feature:')
    ? { feature: choice.slice('feature:'.length) as Feature }
    : { plan: choice as Plan };
}

/** How long a grant lasts (labels to show with `t()`). */
export const DURATIONS: readonly { value: string; label: string; days: number | null }[] = [
  { value: '7', label: mark('7 days'), days: 7 },
  { value: '30', label: mark('30 days'), days: 30 },
  { value: '90', label: mark('90 days'), days: 90 },
  { value: '365', label: mark('1 year'), days: 365 },
  { value: 'forever', label: mark('Until revoked'), days: null },
];
