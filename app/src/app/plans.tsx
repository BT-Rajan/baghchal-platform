import { StyleSheet, Text, View } from 'react-native';

import type { MyPlan, PlanInfo } from '@/api/endpoints';
import { myPlanText, PLAN_NAMES, planLines, priceText } from '@/billing/format';
import { useMyPlan, usePlans } from '@/billing/hooks';
import { Card, Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { colors, radius, spacing } from '@/theme';

/** Free, Plus and Pro side by side, with what each includes and costs. */
export default function Plans() {
  const plans = usePlans();
  const mine = useMyPlan();
  const error = plans.error ?? mine.error;
  return (
    <Screen title="ClawPlay plans" align="top" wide>
      {error !== null ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void plans.refetch();
            void mine.refetch();
          }}
        />
      ) : plans.data === undefined || mine.data === undefined ? (
        <Loading label="Loading the plans" />
      ) : (
        <>
          <Notice tone="info">{myPlanText(mine.data)}</Notice>
          <Hint>
            Everyone plays live games, rated matches and quick pairing for free. Ratings can never
            be bought: paid plans add extras, not advantages.
          </Hint>
          <View style={styles.grid}>
            {plans.data.map((plan, i) => (
              <PlanColumn
                key={plan.plan}
                plan={plan}
                lines={planLines(plans.data, i)}
                mine={mine.data}
              />
            ))}
          </View>
          <Hint>
            Paying online is coming soon. Until then, ClawPlay can add a plan to your account.
          </Hint>
        </>
      )}
    </Screen>
  );
}

function PlanColumn({ plan, lines, mine }: { plan: PlanInfo; lines: string[]; mine: MyPlan }) {
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
