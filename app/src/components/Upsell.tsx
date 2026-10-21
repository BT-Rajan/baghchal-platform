import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { Feature } from '@/api/endpoints';
import { PLAN_NAMES, planFor } from '@/billing/format';
import { usePlans } from '@/billing/hooks';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';

import { BadgePill } from './BadgePill';
import { Button } from './Button';

/**
 * The one way the app offers a paid feature to a player without it: what the feature does,
 * the plan that has it (from the server's plans, never written here), and the way to get it.
 * Use it wherever a feature is locked; never write a notice or link of your own.
 */
export function Upsell({ feature, children }: { feature: Feature; children: string }) {
  const plans = usePlans();
  const plan = plans.data === undefined ? null : planFor(plans.data, feature);
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        {plan !== null && <BadgePill badge={plan} />}
        <Text style={styles.text}>{children}</Text>
      </View>
      <Button
        title={
          plan === null ? t('See plans') : t('Get ClawPlay {plan}', { plan: PLAN_NAMES[plan] })
        }
        compact
        onPress={() => router.push('/plans')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.brand,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
});
