import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { myPlanText } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { colors } from '@/theme';

import { Button } from './Button';
import { Card, SectionTitle } from './Card';
import { ErrorState, Loading } from './States';

/** My plan, on the Me tab, with the way to the plans. */
export function PlanCard() {
  const mine = useMyPlan();
  return (
    <>
      <SectionTitle>Your plan</SectionTitle>
      {mine.error !== null ? (
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data === undefined ? (
        <Loading label="Loading your plan" />
      ) : (
        <Card>
          <Text style={styles.text}>{myPlanText(mine.data)}</Text>
          <Button
            title={mine.data.plan === 'free' ? 'See Plus and Pro' : 'See plans'}
            variant="secondary"
            onPress={() => router.push('/plans')}
          />
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, fontWeight: '600', color: colors.text },
});
