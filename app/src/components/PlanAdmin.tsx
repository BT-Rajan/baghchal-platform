/** For admins, on a player's moderation page: their plan, and granting or revoking access. */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { DURATIONS, GRANTABLE, grantBody, grantText, myPlanText } from '@/billing/format';
import { useChangeGrant, usePlayerPlan } from '@/billing/hooks';
import { mark, t } from '@/i18n';
import { colors } from '@/theme';

import { Button } from './Button';
import { Card, Hint, SectionTitle } from './Card';
import { Segmented } from './Segmented';
import { ErrorState, Loading } from './States';
import { TextField } from './TextField';
import { ErrorNotice } from './ErrorNotice';

const KINDS = [
  { value: 'plus', label: 'Plus' },
  { value: 'pro', label: 'Pro' },
  { value: 'feature', label: mark('One feature') },
] as const;
const FEATURES = GRANTABLE.filter((g) => g.value.startsWith('feature:'));

export function PlanAdmin({ username }: { username: string }) {
  const record = usePlayerPlan(username);
  const change = useChangeGrant(username);
  const [kind, setKind] = useState<'plus' | 'pro' | 'feature'>('plus');
  const [feature, setFeature] = useState(FEATURES[0]!.value);
  const [duration, setDuration] = useState('30');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();

  const withReason = (act: (why: string) => void) => {
    change.reset();
    const why = reason.trim();
    setReasonError(why === '' ? t('Say why; the player is told.') : undefined);
    if (why !== '') act(why);
  };
  const grant = () =>
    withReason((why) =>
      change.mutate(
        {
          grant: {
            ...grantBody(kind === 'feature' ? feature : kind),
            days: DURATIONS.find((d) => d.value === duration)!.days,
            reason: why,
          },
        },
        { onSuccess: () => setReason('') },
      ),
    );

  if (record.error !== null) {
    return <ErrorState error={record.error} onRetry={() => void record.refetch()} />;
  }
  if (record.data === undefined) return <Loading label={t("Loading the player's plan")} />;
  const plan = record.data;
  return (
    <>
      <Card>
        <Text style={styles.title}>{myPlanText(plan, username)}</Text>
      </Card>
      <ErrorNotice error={change.error} />
      <Segmented
        label={t('Give')}
        options={KINDS.map((k) => (k.value === 'feature' ? { ...k, label: t(k.label) } : k))}
        value={kind}
        onChange={setKind}
      />
      {kind === 'feature' && (
        <Segmented
          label={t('Feature')}
          options={FEATURES.map((f) => ({ ...f, label: t(f.label) }))}
          value={feature}
          onChange={setFeature}
          vertical
        />
      )}
      <Segmented
        label={t('For')}
        options={DURATIONS.map((d) => ({ ...d, label: t(d.label) }))}
        value={duration}
        onChange={setDuration}
      />
      <TextField
        label={t('Reason (sent to the player)')}
        value={reason}
        onChangeText={setReason}
        error={reasonError}
        maxLength={500}
      />
      <Button
        title={t('Grant')}
        onPress={grant}
        busy={change.isPending && 'grant' in change.variables}
      />
      <SectionTitle>{t('Grants')}</SectionTitle>
      {plan.history.length === 0 ? (
        <Hint>{t('Nothing granted yet.')}</Hint>
      ) : (
        plan.history.map((g) => (
          <Card key={g.id}>
            <Text style={g.active ? styles.text : styles.muted}>{grantText(g)}</Text>
            {g.active && (
              <Button
                title={t('Revoke: {grant}', { grant: grantText(g) })}
                label={t('Revoke')}
                variant="secondary"
                compact
                busy={
                  change.isPending &&
                  'revoke' in change.variables &&
                  change.variables.revoke === g.id
                }
                onPress={() => withReason((why) => change.mutate({ revoke: g.id, reason: why }))}
              />
            )}
          </Card>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
