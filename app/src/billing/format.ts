/** Words for plans, features, prices and grants. */
import type { Feature, Grant, MyPlan, Plan, PlanInfo } from '@/api/endpoints';

export const PLAN_NAMES: Record<Plan, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

export const FEATURE_LABELS: Record<Feature, string> = {
  computer_hard: 'Play the Hard computer',
  full_history: 'Every game in your history, not just the last 30 days',
  analysis: 'The engine’s review of your finished games',
  themes: 'Board and coin themes, and sound packs',
  badge: 'A badge next to your name',
  private_rooms: 'Private rooms for friends',
  tournaments: 'Host small tournaments',
  trainer: 'Opening and endgame trainer',
};

export function featureText(feature: Feature): string {
  return FEATURE_LABELS[feature];
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** "₹149 a month · ₹1,490 a year", or "Free for everyone". */
export function priceText(plan: PlanInfo): string {
  if (plan.monthly_paise === null || plan.yearly_paise === null) return 'Free for everyone';
  return `${rupees(plan.monthly_paise)} a month · ${rupees(plan.yearly_paise)} a year`;
}

function dayText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "You have ClawPlay Plus until 18 Jan 2027." / "You are on the Free plan." — or, for an admin
 * looking at a player, "alice has ClawPlay Plus…" / "alice is on the Free plan."
 */
export function myPlanText(mine: MyPlan, who: string | null = null): string {
  if (mine.plan === 'free')
    return `${who ?? 'You'} ${who === null ? 'are' : 'is'} on the Free plan.`;
  const until = mine.plan_until === null ? '' : ` until ${dayText(mine.plan_until)}`;
  return `${who ?? 'You'} ${who === null ? 'have' : 'has'} ClawPlay ${PLAN_NAMES[mine.plan]}${until}.`;
}

/**
 * "ClawPlay Pro · until 18 Jan 2027 · given by boss: Welcome gift", or for a bought plan
 * "ClawPlay Plus · until 17 Nov 2026 · Paid ₹149 for a month (pay_…)".
 */
export function grantText(grant: Grant): string {
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
        : `${grant.active ? 'until' : 'ended'} ${dayText(grant.ends_at)}`;
  return grant.paid
    ? `${what} · ${when} · ${grant.reason}`
    : `${what} · ${when} · given by ${grant.granted_by ?? 'a former admin'}: ${grant.reason}`;
}

/**
 * What a plan adds over the plan below it, in a sensible order: "Everything in Plus" first
 * where it applies, then the new features.
 */
export function planLines(plans: readonly PlanInfo[], index: number): string[] {
  const plan = plans[index]!;
  const below = index > 0 ? plans[index - 1]! : plan;
  const before = below === plan ? [] : below.features;
  const added = (Object.keys(FEATURE_LABELS) as Feature[]).filter(
    (f) => plan.features.includes(f) && !before.includes(f),
  );
  const lines = added.map(featureText);
  return before.length > 0 ? [`Everything in ${PLAN_NAMES[below.plan]}, and:`, ...lines] : lines;
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
