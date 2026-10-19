import { StyleSheet, Text, View } from 'react-native';

import type { MyPlan, Period, PlanInfo } from '@/api/endpoints';
import { myPlanText, PLAN_NAMES, planLines, priceText } from '@/billing/format';
import { useMyPlan, usePlans } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { buyErrorText, buyLabel, paymentText, thanksText } from '@/payments/format';
import { useBuy, usePayments } from '@/payments/hooks';
import { colors, radius, spacing } from '@/theme';

/** Free, Plus and Pro side by side, with what each includes and costs. */
export default function Plans() {
  const plans = usePlans();
  const mine = useMyPlan();
  const payments = usePayments();
  const buy = useBuy();
  const error = plans.error ?? mine.error ?? payments.error;
  const buyError = buy.error === null ? null : buyErrorText(buy.error);
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
                  lines={planLines(plans.data, i)}
                  mine={mine.data}
                  onBuy={
                    payments.data.enabled && paid !== null
                      ? (period) => buy.mutate({ plan: paid, period })
                      : null
                  }
                  buying={buy.isPending}
                />
              );
            })}
          </View>
          <Hint>
            {payments.data.enabled
              ? 'Payments are taken by Razorpay: cards, UPI, net banking and wallets. Plans are paid in advance for a month or a year and never renew by themselves; buying again adds on to the time you have.'
              : 'Paying online is coming soon. Until then, ClawPlay can add a plan to your account.'}
          </Hint>
          {payments.data.payments.length > 0 && (
            <>
              <SectionTitle>Your payments</SectionTitle>
              <Card>
                {payments.data.payments.map((p) => (
                  <Text key={p.id} style={styles.feature}>
                    {paymentText(p)}
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
  lines,
  mine,
  onBuy,
  buying,
}: {
  plan: PlanInfo;
  lines: string[];
  mine: MyPlan;
  /** Null where this plan cannot be bought (Free, or payments off). */
  onBuy: ((period: Period) => void) | null;
  buying: boolean;
}) {
  const current = plan.plan === mine.plan;
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
        <Text style={styles.price}>{priceText(plan)}</Text>
        {lines.length === 0 ? (
          <Text style={styles.feature}>
            Unlimited live and rated games, quick pairing, the Easy and Medium computer, and 30 days
            of history
          </Text>
        ) : (
          lines.map((line) => (
            <Text key={line} style={line.endsWith(':') ? styles.lead : styles.feature}>
              {line.endsWith(':') ? line : `✓ ${line}`}
            </Text>
          ))
        )}
        {plan.analyses_per_day !== null && plan.analyses_per_day > 0 && (
          <Text style={styles.muted}>{`Game analysis: ${plan.analyses_per_day} a day`}</Text>
        )}
        {onBuy !== null &&
          (['month', 'year'] as const).map((period) => (
            <Button
              key={period}
              title={`Buy ClawPlay ${PLAN_NAMES[plan.plan]} for a ${period}`}
              label={buyLabel(plan, period)}
              variant={period === 'year' ? 'primary' : 'secondary'}
              disabled={buying}
              onPress={() => onBuy(period)}
            />
          ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  column: { flexGrow: 1, flexBasis: 260, borderRadius: radius.md },
  current: { borderWidth: 2, borderColor: colors.accent },
  name: { fontSize: 22, fontWeight: '800', color: colors.brandInk },
  badge: { fontSize: 13, fontWeight: '700', color: colors.accent },
  price: { fontSize: 16, fontWeight: '600', color: colors.text },
  feature: { fontSize: 15, color: colors.text },
  lead: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
