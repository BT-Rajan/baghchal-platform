/** Words for payments. */
import type { Payment, Period, PlanInfo } from '@/api/endpoints';
import { ApiError, describeError } from '@/api/errors';
import { PLAN_NAMES } from '@/billing/format';

import { CheckoutClosed } from './razorpay';

const FOR: Record<Period, string> = { month: 'a month', year: 'a year' };

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

/** "Buy a month · ₹149" */
export function buyLabel(plan: PlanInfo, period: Period): string {
  const paise = period === 'month' ? plan.monthly_paise : plan.yearly_paise;
  return `Buy ${FOR[period]} · ${rupees(paise ?? 0)}`;
}

/**
 * "Thank you! You have ClawPlay Plus until 17 Nov 2026.", or for time lined up after a better
 * plan, "Thank you! Your ClawPlay Plus starts on 1 Jan 2027, when your better plan ends, and
 * runs until 31 Jan 2027."
 */
export function thanksText(payment: Payment): string {
  const until = payment.until === null ? '' : ` until ${dayText(payment.until)}`;
  const name = `ClawPlay ${PLAN_NAMES[payment.plan]}`;
  if (payment.starts !== null && payment.paid_at !== null && payment.starts > payment.paid_at)
    return `Thank you! Your ${name} starts on ${dayText(payment.starts)}, when your better plan ends, and runs${until}.`;
  return `Thank you! You have ${name}${until}.`;
}

/** "ClawPlay Plus for a month · ₹149 · 18 Oct 2026 · paid" */
export function paymentText(payment: Payment): string {
  return [
    `ClawPlay ${PLAN_NAMES[payment.plan]} for ${FOR[payment.period]}`,
    rupees(payment.amount_paise),
    dayText(payment.created_at),
    payment.status === 'paid' ? 'paid' : 'not paid',
  ].join(' · ');
}

/** What to say when buying did not work; null when the player simply closed the window. */
export function buyErrorText(error: unknown): string | null {
  if (error instanceof CheckoutClosed) return error.failure;
  if (error instanceof ApiError) return describeError(error);
  return error instanceof Error ? error.message : describeError(error);
}
