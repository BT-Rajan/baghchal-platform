/** Words for plans, features, prices and grants. */
import type { Feature, Grant, MyPlan, PaidPlan, Plan, PlanInfo } from '@/api/endpoints';

export const PLAN_NAMES: Record<Plan, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

export const FEATURE_LABELS: Record<Feature, string> = {
  computer_hard: 'Play the Hard computer',
  full_history: 'Your whole game history',
  analysis: 'The engine’s review of your finished games',
  themes: 'Board and coin themes, and sound packs',
  badge: 'A badge next to your name',
  tournaments: 'Host small tournaments',
  trainer: 'Opening and endgame trainer',
};

export function featureText(feature: Feature): string {
  return FEATURE_LABELS[feature];
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** "45 games or a month", "A month or a year", or "Always" (Free). */
export function lastsText(plan: PlanInfo): string {
  if (plan.monthly_paise === null) return 'Always';
  if (plan.games !== null) return `${plan.games} games or a month`;
  return plan.yearly_paise === null ? 'A month' : 'A month or a year';
}

/** "₹299 a month · ₹2,990 a year", "₹149 for 45 games or a month", or "Free for everyone". */
export function priceText(plan: PlanInfo): string {
  if (plan.monthly_paise === null) return 'Free for everyone';
  if (plan.games !== null)
    return `${rupees(plan.monthly_paise)} for ${plan.games} games or a month`;
  const year = plan.yearly_paise === null ? '' : ` · ${rupees(plan.yearly_paise)} a year`;
  return `${rupees(plan.monthly_paise)} a month${year}`;
}

function dayText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** " Then ClawPlay Plus until 30 Jan 2028.": plan time lined up after the current plan. */
function thenText(mine: MyPlan): string {
  const ends = new Map<Plan, string>();
  for (const g of mine.waiting)
    if (g.plan !== null && g.plan !== mine.plan && g.ends_at !== null) ends.set(g.plan, g.ends_at);
  return [...ends]
    .map(([plan, end]) => ` Then ClawPlay ${PLAN_NAMES[plan]} until ${dayText(end)}.`)
    .join('');
}

/**
 * "You have ClawPlay Plus until 18 Jan 2027." / "You are on the Free plan." — or, for an admin
 * looking at a player, "alice has ClawPlay Plus…" / "alice is on the Free plan." Plan time
 * waiting its turn follows: "… Then ClawPlay Plus until 30 Jan 2028."
 */
export function myPlanText(mine: MyPlan, who: string | null = null): string {
  const then = thenText(mine);
  if (mine.plan === 'free')
    return `${who ?? 'You'} ${who === null ? 'are' : 'is'} on the Free plan.${then}`;
  const until = mine.plan_until === null ? '' : ` until ${dayText(mine.plan_until)}`;
  const has = `${who ?? 'You'} ${who === null ? 'have' : 'has'} ClawPlay ${PLAN_NAMES[mine.plan]}`;
  if (mine.games_left !== null)
    return `${has} for up to ${mine.games_left} more ${mine.games_left === 1 ? 'game' : 'games'}${until} at the latest.${then}`;
  return `${has}${until}.${then}`;
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
        ? FEATURE_LABELS[grant.feature]
        : 'Access';
  const when =
    grant.revoked_at !== null
      ? `revoked ${dayText(grant.revoked_at)}`
      : grant.ends_at === null
        ? 'until revoked'
        : Date.parse(grant.starts_at) > now
          ? `from ${dayText(grant.starts_at)} until ${dayText(grant.ends_at)}`
          : `${grant.active ? 'until' : 'ended'} ${dayText(grant.ends_at)}`;
  const games = grant.games_left === null ? '' : ` · ${grant.games_left} games left`;
  return grant.paid
    ? `${what} · ${when}${games} · ${grant.reason}`
    : `${what} · ${when} · given by ${grant.granted_by ?? 'a former admin'}: ${grant.reason}`;
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
    { label: 'How long it lasts', cells: plans.map(lastsText) },
    all('Live and rated games, quick pairing'),
    all('The Easy and Medium computer'),
    all('The daily puzzle'),
    ...(Object.keys(FEATURE_LABELS) as Feature[]).map((feature) => ({
      label: FEATURE_LABELS[feature],
      cells: plans.map((plan) => {
        if (!plan.features.includes(feature)) return feature === 'full_history' ? '30 days' : '—';
        if (feature === 'analysis' && plan.analyses_per_day !== null)
          return `${plan.analyses_per_day} a day`;
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
  return `${months} ${months === 1 ? 'month' : 'months'} free when you pay for a year`;
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

/** What an admin can grant: a whole plan, or one feature. */
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

export const DURATIONS: readonly { value: string; label: string; days: number | null }[] = [
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '1 year', days: 365 },
  { value: 'forever', label: 'Until revoked', days: null },
];
