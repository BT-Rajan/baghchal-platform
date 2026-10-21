import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { myPlanText } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { t } from '@/i18n';
import { colors, type } from '@/theme';

import { Button } from './Button';
import { Card, SectionTitle } from './Card';
import { ErrorState, Loading } from './States';

/** My plan, in Settings, with the way to the plans. */
export function PlanCard() {
  const mine = useMyPlan();
  return (
    <>
      <SectionTitle>{t('Your plan')}</SectionTitle>
      {mine.error !== null ? (
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data === undefined ? (
        <Loading label={t('Loading your plan')} />
      ) : (
        <Card>
          <Text style={styles.text}>{myPlanText(mine.data)}</Text>
          <Button
            title={t('See plans')}
            variant="secondary"
            onPress={() => router.push('/plans')}
          />
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  text: { ...type.body, fontWeight: '600', color: colors.text },
});
