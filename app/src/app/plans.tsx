import { Platform, StyleSheet, Text, View } from 'react-native';

import type { MyPlan, Period, PlanInfo } from '@/api/endpoints';
import {
  comparisonRows,
  myPlanText,
  planName,
  PLAN_NAMES,
  priceText,
  yearlySaving,
} from '@/billing/format';
import { useMyPlan, usePlans } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Disclosure } from '@/components/Disclosure';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { plural, t } from '@/i18n';
import { buyErrorText, buyLabel, paymentText, periodsOf, thanksText } from '@/payments/format';
import { useBuy, usePayments } from '@/payments/hooks';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The server's plans: what each costs, a way to buy it, and a table of what each includes
 * (folded shut until asked for).
 */
export default function Plans() {
  const plans = usePlans();
  const mine = useMyPlan();
  const payments = usePayments();
  const buy = useBuy();
  const error = plans.error ?? mine.error ?? payments.error;
  // The apps do not sell plans, nor point to where they are sold (app stores forbid it): they
  // show what each plan includes. Buying is on the website, which says so itself.
  const inApp = Platform.OS !== 'web';
  return (
    <Screen align="top" wide>
      {error !== null ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void plans.refetch();
            void mine.refetch();
            void payments.refetch();
          }}
        />
      ) : plans.data === undefined || mine.data === undefined || payments.data === undefined ? (
        <Loading label={t('Loading the plans')} />
      ) : (
        <>
          <Notice tone="info">{myPlanText(mine.data)}</Notice>
          <Hint>
            {t(
              'Playing, rated games included, is free. Plans add extras; ratings are never for sale.',
            )}
          </Hint>
          <View style={styles.grid}>
            {plans.data.map((plan, i) => {
              const paid = plan.plan === 'free' ? null : plan.plan;
              // The server lists the plans cheapest first.
              const mineAt = plans.data.findIndex((p) => p.plan === mine.data.plan);
              return (
                <PlanColumn
                  key={plan.plan}
                  plan={plan}
                  mine={mine.data}
                  cheaper={i < mineAt}
                  // The one main action: the plan above mine.
                  next={i === mineAt + 1}
                  onBuy={
                    payments.data.enabled && paid !== null && !inApp
                      ? (period) => buy.mutate({ plan: paid, period })
                      : null
                  }
                  buy={buy}
                  priced={!inApp}
                />
              );
            })}
          </View>
          <Comparison plans={plans.data} mine={mine.data} />
          <View role="list" style={styles.list}>
            {[
              ...(inApp
                ? []
                : payments.data.enabled
                  ? [t('Payments are taken by Razorpay: cards, UPI, net banking and wallets.')]
                  : [t('Paying online is coming soon.')]),
              ...plans.data.filter((plan) => plan.plan !== 'free').map(lastsLine),
              ...(!inApp && payments.data.enabled
                ? [
                    t('Plans are paid in advance and never renew by themselves.'),
                    t('Buying again adds on.'),
                    t('A better plan starts at once; a lesser one waits for it to end.'),
                  ]
                : []),
            ].map((line) => (
              <View key={line} role="listitem" style={styles.itemRow}>
                <Text aria-hidden style={styles.item}>
                  •
                </Text>
                <Text style={[styles.item, styles.itemText]}>{line}</Text>
              </View>
            ))}
          </View>
          {payments.data.payments.length > 0 && (
            <>
              <SectionTitle>{t('Your payments')}</SectionTitle>
              <Card>
                {payments.data.payments.map((p) => (
                  <Text key={p.id} style={styles.payment}>
                    {paymentText(p, plans.data.find((info) => info.plan === p.plan)?.games ?? null)}
                  </Text>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/** "Plus lasts 45 finished games or a month, whichever comes first.", from the server's plan. */
function lastsLine(plan: PlanInfo): string {
  const values = { plan: planName(plan.plan) };
  return plan.games === null
    ? t('{plan} has no game limit.', values)
    : plural(
        plan.games,
        '{plan} lasts {count} finished game or a month, whichever comes first.',
        '{plan} lasts {count} finished games or a month, whichever comes first.',
        values,
      );
}

function PlanColumn({
  plan,
  mine,
  cheaper,
  next,
  onBuy,
  buy,
  priced,
}: {
  plan: PlanInfo;
  mine: MyPlan;
  /** Cheaper than the player's plan: time bought now waits for it to end. */
  cheaper: boolean;
  /** The plan above the player's: its first way to buy is the screen's main action. */
  next: boolean;
  /** Null where this plan cannot be bought (Free, or payments off). */
  onBuy: ((period: Period) => void) | null;
  buy: ReturnType<typeof useBuy>;
  /** Prices shown (on the website; the apps show what a plan includes, not what it costs). */
  priced: boolean;
}) {
  const current = plan.plan === mine.plan;
  // A purchase's result shows in the card of the plan bought.
  const bought = buy.variables?.plan === plan.plan;
  const buyError = bought && buy.error !== null ? buyErrorText(buy.error) : null;
  const saving = yearlySaving(plan);
  const name = planName(plan.plan);
  return (
    <View
      style={[styles.column, current && styles.current]}
      aria-label={current ? t('{plan}, your plan', { plan: name }) : name}
    >
      <Card>
        <Text role="heading" style={styles.name}>
          {name}
        </Text>
        {current && <Text style={styles.badge}>{t('Your plan')}</Text>}
        {priced && <Text style={styles.price}>{priceText(plan)}</Text>}
        {priced && saving !== null && <Text style={styles.saving}>{saving}</Text>}
        {onBuy !== null && cheaper && (
          <Hint>
            {t('Starts when your {plan} ends.', {
              plan: planName(mine.plan),
            })}
          </Hint>
        )}
        {onBuy !== null &&
          periodsOf(plan).map((period, i) => (
            <Button
              key={period}
              title={
                period === 'month'
                  ? t('Buy ClawPlay {plan} for a month', { plan: PLAN_NAMES[plan.plan] })
                  : t('Buy ClawPlay {plan} for a year', { plan: PLAN_NAMES[plan.plan] })
              }
              label={buyLabel(plan, period)}
              variant={next && i === 0 ? 'primary' : 'secondary'}
              busy={buy.isPending && bought && buy.variables.period === period}
              disabled={buy.isPending}
              onPress={() => onBuy(period)}
            />
          ))}
        {bought && buy.data !== undefined && <Notice tone="success">{thanksText(buy.data)}</Notice>}
        {buyError !== null && <Notice tone="error">{buyError}</Notice>}
      </Card>
    </View>
  );
}

/** What each plan includes, row by row, from the server's plans. */
function Comparison({ plans, mine }: { plans: readonly PlanInfo[]; mine: MyPlan }) {
  return (
    <Disclosure title={t('Compare the plans')}>
      <Card>
        <View style={styles.tableRow}>
          <Text style={styles.feature} />
          {plans.map((plan) => (
            <Text key={plan.plan} style={[styles.head, plan.plan === mine.plan && styles.headMine]}>
              {planName(plan.plan)}
            </Text>
          ))}
        </View>
        {comparisonRows(plans).map((row) => (
          <View key={row.label} style={[styles.tableRow, styles.divided]}>
            <Text style={styles.feature}>{row.label}</Text>
            {row.cells.map((cell, i) => (
              <Text
                key={plans[i]!.plan}
                aria-label={
                  cell === '✓'
                    ? t('{plan}: included', { plan: planName(plans[i]!.plan) })
                    : cell === '—'
                      ? t('{plan}: not included', { plan: planName(plans[i]!.plan) })
                      : t('{plan}: {value}', { plan: planName(plans[i]!.plan), value: cell })
                }
                style={[styles.cell, cell === '✓' && styles.yes, cell === '—' && styles.no]}
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </Card>
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  column: { flexGrow: 1, flexBasis: 260, borderRadius: radius.md },
  current: { borderWidth: 2, borderColor: colors.accent },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  badge: { fontSize: 13, fontWeight: '700', color: colors.accent },
  price: { fontSize: 16, fontWeight: '600', color: colors.text },
  saving: { ...type.label, color: colors.success },
  payment: { ...type.small, color: colors.text },
  list: { gap: spacing.xs },
  itemRow: { flexDirection: 'row', gap: spacing.sm },
  item: { ...type.small, color: colors.muted },
  itemText: { flex: 1 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  divided: { borderTopWidth: 1, borderTopColor: colors.subtle },
  feature: { flex: 2, fontSize: 15, color: colors.text },
  head: { flex: 1, ...type.label, color: colors.muted, textAlign: 'center' },
  headMine: { color: colors.accent },
  cell: { flex: 1, fontSize: 14, color: colors.text, textAlign: 'center' },
  yes: { fontSize: 18, fontWeight: '700', color: colors.success },
  no: { color: colors.muted },
});
