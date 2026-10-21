import { Platform, StyleSheet, Text, View } from 'react-native';

import type { MyPlan, Period, PlanInfo } from '@/api/endpoints';
import { comparisonRows, myPlanText, PLAN_NAMES, priceText, yearlySaving } from '@/billing/format';
import { useMyPlan, usePlans } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Disclosure } from '@/components/Disclosure';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import {
  buyErrorText,
  buyLabel,
  paymentText,
  periodsOf,
  refusedAsMinor,
  thanksText,
} from '@/payments/format';
import { useBuy, usePayments } from '@/payments/hooks';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Free, Plus and Pro: what each costs, a way to buy it, and a table of what each includes
 * (folded shut until asked for).
 */
export default function Plans() {
  const plans = usePlans();
  const mine = useMyPlan();
  const payments = usePayments();
  const buy = useBuy();
  const error = plans.error ?? mine.error ?? payments.error;
  const buyError = buy.error === null ? null : buyErrorText(buy.error);
  // Under 18: the server told their parent; buying stays off.
  const minor = refusedAsMinor(buy.error);
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
        <Loading label="Loading the plans" />
      ) : (
        <>
          {buy.data !== undefined ? (
            <Notice tone="success">{thanksText(buy.data)}</Notice>
          ) : (
            <Notice tone="info">{myPlanText(mine.data)}</Notice>
          )}
          {buyError !== null && <Notice tone="error">{buyError}</Notice>}
          <Hint>
            Everyone plays live games, rated matches and quick pairing for free. Ratings can never
            be bought: paid plans add extras, not advantages.
          </Hint>
          <View style={styles.grid}>
            {plans.data.map((plan, i) => {
              const paid = plan.plan === 'free' ? null : plan.plan;
              return (
                <PlanColumn
                  key={plan.plan}
                  plan={plan}
                  mine={mine.data}
                  // The server lists the plans cheapest first.
                  cheaper={i < plans.data.findIndex((p) => p.plan === mine.data.plan)}
                  onBuy={
                    payments.data.enabled && paid !== null && !inApp
                      ? (period) => buy.mutate({ plan: paid, period })
                      : null
                  }
                  buying={buy.isPending || minor}
                  priced={!inApp}
                />
              );
            })}
          </View>
          <Comparison plans={plans.data} mine={mine.data} />
          <Hint>
            {inApp
              ? 'Plus lasts 45 finished games or a month, whichever comes first; Pro has no limits.'
              : payments.data.enabled
                ? 'Payments are taken by Razorpay: cards, UPI, net banking and wallets. Plus lasts 45 finished games or a month, whichever comes first; Pro has no limits. Plans are paid in advance and never renew by themselves; buying again adds on. Pro starts at once, and Plus you had left follows it; Plus bought while you have Pro starts when Pro ends. Players under 18 cannot buy plans: their parent or guardian is told instead.'
                : 'Paying online is coming soon. Until then, ClawPlay can add a plan to your account.'}
          </Hint>
          {payments.data.payments.length > 0 && (
            <>
              <SectionTitle>Your payments</SectionTitle>
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

function PlanColumn({
  plan,
  mine,
  cheaper,
  onBuy,
  buying,
  priced,
}: {
  plan: PlanInfo;
  mine: MyPlan;
  /** Cheaper than the player's plan: time bought now waits for it to end. */
  cheaper: boolean;
  /** Null where this plan cannot be bought (Free, or payments off). */
  onBuy: ((period: Period) => void) | null;
  buying: boolean;
  /** Prices shown (on the website; the apps show what a plan includes, not what it costs). */
  priced: boolean;
}) {
  const current = plan.plan === mine.plan;
  const saving = yearlySaving(plan);
  return (
    <View
      style={[styles.column, current && styles.current]}
      aria-label={`${PLAN_NAMES[plan.plan]}${current ? ', your plan' : ''}`}
    >
      <Card>
        <Text role="heading" style={styles.name}>
          {PLAN_NAMES[plan.plan]}
        </Text>
        {current && <Text style={styles.badge}>Your plan</Text>}
        {priced && <Text style={styles.price}>{priceText(plan)}</Text>}
        {priced && saving !== null && <Text style={styles.saving}>{saving}</Text>}
        {onBuy !== null && cheaper && (
          <Hint>{`Starts when your ${PLAN_NAMES[mine.plan]} ends, so none of it is spent underneath it.`}</Hint>
        )}
        {onBuy !== null &&
          periodsOf(plan).map((period, i) => (
            <Button
              key={period}
              title={`Buy ClawPlay ${PLAN_NAMES[plan.plan]} for a ${period}`}
              label={buyLabel(plan, period)}
              variant={i === 0 ? 'primary' : 'secondary'}
              disabled={buying}
              onPress={() => onBuy(period)}
            />
          ))}
      </Card>
    </View>
  );
}

/** What each plan includes, row by row, from the server's plans. */
function Comparison({ plans, mine }: { plans: readonly PlanInfo[]; mine: MyPlan }) {
  return (
    <Disclosure title="Compare the plans">
      <Card>
        <View style={styles.tableRow}>
          <Text style={styles.feature} />
          {plans.map((plan) => (
            <Text key={plan.plan} style={[styles.head, plan.plan === mine.plan && styles.headMine]}>
              {PLAN_NAMES[plan.plan]}
            </Text>
          ))}
        </View>
        {comparisonRows(plans).map((row) => (
          <View key={row.label} style={[styles.tableRow, styles.divided]}>
            <Text style={styles.feature}>{row.label}</Text>
            {row.cells.map((cell, i) => (
              <Text
                key={plans[i]!.plan}
                aria-label={`${PLAN_NAMES[plans[i]!.plan]}: ${
                  cell === '✓' ? 'included' : cell === '—' ? 'not included' : cell
                }`}
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
  name: { fontSize: 22, fontWeight: '800', color: colors.brandInk },
  badge: { fontSize: 13, fontWeight: '700', color: colors.accent },
  price: { fontSize: 16, fontWeight: '600', color: colors.text },
  saving: { ...type.label, color: colors.success },
  payment: { fontSize: 15, color: colors.text },
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
