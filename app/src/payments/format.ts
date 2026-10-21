/** Words for payments. */
import type { Payment, PaymentKeys, Period, PlanInfo } from '@/api/endpoints';
import { ApiError, describeError } from '@/api/errors';
import { PLAN_NAMES } from '@/billing/format';
import { language, locale, mark, plural, t } from '@/i18n';
import { dayText } from '@/lobby/format';
import { dateTimeText } from '@/lobby/moderation';

import { CheckoutClosed } from './razorpay';

const STATUS: Record<Payment['status'], string> = {
  paid: mark('paid'),
  created: mark('not paid'),
  failed: mark('not paid'),
  refunded: mark('refunded'),
  reversed: mark('reversed by the bank'),
};

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString(language() === 'en' ? 'en-IN' : locale(), { maximumFractionDigits: 2 })}`;
}

/** "Buy a month · ₹299", or for a plan that also ends on games, "Buy 45 games or a month · ₹149". */
export function buyLabel(plan: PlanInfo, period: Period): string {
  const paise = period === 'month' ? plan.monthly_paise : plan.yearly_paise;
  const price = rupees(paise ?? 0);
  if (plan.games === null)
    return period === 'month'
      ? t('Buy a month · {price}', { price })
      : t('Buy a year · {price}', { price });
  return period === 'month'
    ? plural(
        plan.games,
        'Buy {count} game or a month · {price}',
        'Buy {count} games or a month · {price}',
        { price },
      )
    : plural(
        plan.games,
        'Buy {count} game or a year · {price}',
        'Buy {count} games or a year · {price}',
        { price },
      );
}

/** The periods a plan is sold for, longest first. */
export function periodsOf(plan: PlanInfo): Period[] {
  return (['year', 'month'] as const).filter(
    (p) => (p === 'year' ? plan.yearly_paise : plan.monthly_paise) !== null,
  );
}

/**
 * "Thank you! You have ClawPlay Plus until 17 Nov 2026.", or for time lined up after a better
 * plan, "Thank you! Your ClawPlay Plus starts on 1 Jan 2027, after the plan time you already have, and
 * runs until 31 Jan 2027."
 */
export function thanksText(payment: Payment): string {
  const plan = PLAN_NAMES[payment.plan];
  const until = payment.until === null ? null : dayText(payment.until);
  if (payment.starts !== null && payment.paid_at !== null && payment.starts > payment.paid_at) {
    const date = dayText(payment.starts);
    return until === null
      ? t(
          'Thank you! Your ClawPlay {plan} starts on {date}, after the plan time you already have, and runs.',
          { plan, date },
        )
      : t(
          'Thank you! Your ClawPlay {plan} starts on {date}, after the plan time you already have, and runs until {until}.',
          { plan, date, until },
        );
  }
  return until === null
    ? t('Thank you! You have ClawPlay {plan}.', { plan })
    : t('Thank you! You have ClawPlay {plan} until {until}.', { plan, until });
}

/** "ClawPlay Pro for a month · ₹299 · 18 Oct 2026 · paid"; with the plan's games, "ClawPlay
 * Plus for 45 games or a month · …". */
export function paymentText(payment: Payment, games: number | null = null): string {
  const plan = PLAN_NAMES[payment.plan];
  const month = payment.period === 'month';
  const what =
    games === null
      ? month
        ? t('ClawPlay {plan} for a month', { plan })
        : t('ClawPlay {plan} for a year', { plan })
      : month
        ? plural(
            games,
            'ClawPlay {plan} for {count} game or a month',
            'ClawPlay {plan} for {count} games or a month',
            { plan },
          )
        : plural(
            games,
            'ClawPlay {plan} for {count} game or a year',
            'ClawPlay {plan} for {count} games or a year',
            { plan },
          );
  return [
    what,
    rupees(payment.amount_paise),
    dayText(payment.created_at),
    t(STATUS[payment.status]),
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
  const time = page.updated_at === null ? null : dateTimeText(page.updated_at);
  const set =
    time === null
      ? null
      : page.updated_by === null
        ? t('(set by a former admin, {time})', { time })
        : t('(set by {name}, {time})', { name: page.updated_by, time });
  const key = page.key_id;
  if (page.on && key !== null) {
    if (key.startsWith('rzp_live_'))
      return set === null
        ? t('Payments are on, with the live keys {key}.', { key })
        : t('Payments are on, with the live keys {key} {set}.', { key, set });
    return set === null
      ? t('Payments are on, with the test keys {key}.', { key })
      : t('Payments are on, with the test keys {key} {set}.', { key, set });
  }
  if (key !== null)
    return set === null
      ? t(
          "Payments are off: the keys stored cannot be read with the server's secrets key. Enter them again.",
        )
      : t(
          "Payments are off: the keys stored {set} cannot be read with the server's secrets key. Enter them again.",
          { set },
        );
  return t('Payments are off: the plans page says paying online is coming soon.');
}

/** What is wrong with the keys typed in, or null. */
export function keysProblem(
  keyId: string,
  keySecret: string,
  webhookSecret: string,
): string | null {
  if (!/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId.trim()))
    return t('The key id starts rzp_test_ or rzp_live_.');
  if (keySecret.length < 8) return t('Enter the key secret.');
  if (webhookSecret.length < 8) return t('Enter the webhook secret (at least 8 characters).');
  return null;
}
