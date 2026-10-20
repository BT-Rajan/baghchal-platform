/** Words for payments. */
import type { Payment, PaymentKeys, Period, PlanInfo } from '@/api/endpoints';
import { ApiError, describeError } from '@/api/errors';
import { PLAN_NAMES } from '@/billing/format';
import { dateTimeText } from '@/lobby/moderation';

import { CheckoutClosed } from './razorpay';

const FOR: Record<Period, string> = { month: 'a month', year: 'a year' };

const STATUS: Record<Payment['status'], string> = {
  paid: 'paid',
  created: 'not paid',
  failed: 'not paid',
  refunded: 'refunded',
  reversed: 'reversed by the bank',
};

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function dayText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Buy a month · ₹299", or for a plan that also ends on games, "Buy 45 games or a month · ₹149". */
export function buyLabel(plan: PlanInfo, period: Period): string {
  const paise = period === 'month' ? plan.monthly_paise : plan.yearly_paise;
  const what = plan.games !== null ? `${plan.games} games or ${FOR[period]}` : FOR[period];
  return `Buy ${what} · ${rupees(paise ?? 0)}`;
}

/** The periods a plan is sold for, longest first. */
export function periodsOf(plan: PlanInfo): Period[] {
  return (['year', 'month'] as const).filter(
    (p) => (p === 'year' ? plan.yearly_paise : plan.monthly_paise) !== null,
  );
}

/** Whether buying was refused because the player is under 18 (their parent has been told). */
export function refusedAsMinor(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'under_18';
}

/**
 * "Thank you! You have ClawPlay Plus until 17 Nov 2026.", or for time lined up after a better
 * plan, "Thank you! Your ClawPlay Plus starts on 1 Jan 2027, after the plan time you already have, and
 * runs until 31 Jan 2027."
 */
export function thanksText(payment: Payment): string {
  const until = payment.until === null ? '' : ` until ${dayText(payment.until)}`;
  const name = `ClawPlay ${PLAN_NAMES[payment.plan]}`;
  if (payment.starts !== null && payment.paid_at !== null && payment.starts > payment.paid_at)
    return `Thank you! Your ${name} starts on ${dayText(payment.starts)}, after the plan time you already have, and runs${until}.`;
  return `Thank you! You have ${name}${until}.`;
}

/** "ClawPlay Pro for a month · ₹299 · 18 Oct 2026 · paid"; with the plan's games, "ClawPlay
 * Plus for 45 games or a month · …". */
export function paymentText(payment: Payment, games: number | null = null): string {
  const lasts = games === null ? FOR[payment.period] : `${games} games or ${FOR[payment.period]}`;
  return [
    `ClawPlay ${PLAN_NAMES[payment.plan]} for ${lasts}`,
    rupees(payment.amount_paise),
    dayText(payment.created_at),
    STATUS[payment.status],
  ].join(' · ');
}

/** What to say when buying did not work; null when the player simply closed the window. */
export function buyErrorText(error: unknown): string | null {
  if (error instanceof CheckoutClosed) return error.failure;
  if (error instanceof ApiError) return describeError(error);
  return error instanceof Error ? error.message : describeError(error);
}

/**
 * "Payments are on, with the live keys rzp_live_… (set by boss, 20 Oct 2026, 10:00).", or why
 * they are off.
 */
export function keysText(page: PaymentKeys): string {
  const set =
    page.updated_at === null
      ? ''
      : ` (set by ${page.updated_by ?? 'a former admin'}, ${dateTimeText(page.updated_at)})`;
  if (page.on && page.key_id !== null) {
    const mode = page.key_id.startsWith('rzp_live_') ? 'live' : 'test';
    return `Payments are on, with the ${mode} keys ${page.key_id}${set}.`;
  }
  if (page.key_id !== null)
    return `Payments are off: the keys stored${set} cannot be read with the server's secrets key. Enter them again.`;
  return 'Payments are off: the plans page says paying online is coming soon.';
}

/** What is wrong with the keys typed in, or null. */
export function keysProblem(
  keyId: string,
  keySecret: string,
  webhookSecret: string,
): string | null {
  if (!/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId.trim()))
    return 'The key id starts rzp_test_ or rzp_live_.';
  if (keySecret.length < 8) return 'Enter the key secret.';
  if (webhookSecret.length < 8) return 'Enter the webhook secret (at least 8 characters).';
  return null;
}
