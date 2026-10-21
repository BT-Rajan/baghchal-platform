import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { TimeControl } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Upsell } from '@/components/Upsell';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { TimeControlPicker } from '@/components/TimeControlPicker';
import { plural, t } from '@/i18n';

import { tournamentStatusText } from '@/pro/format';
import { useCreateTournament, useTournaments } from '@/pro/hooks';
import { colors } from '@/theme';

const SIZES = ['4', '8', '16', '32'];

/** Small tournaments: hosting one (Pro), and the ones I am in. */
export default function Tournaments() {
  const plan = useMyPlan();
  return (
    <Screen align="top" refreshable>
      <Hint>
        {t(
          'A Swiss tournament for 3 to 32 friends: each round you meet a player on your score, never the same one twice if it can be helped, with sides taking turns. Games are casual; anyone can join with the link.',
        )}
      </Hint>
      {plan.data !== undefined &&
        (has(plan.data, 'tournaments') ? (
          <NewTournament />
        ) : (
          <Upsell feature="tournaments">{t('Host small tournaments for your friends.')}</Upsell>
        ))}
      <MyTournaments />
    </Screen>
  );
}

function NewTournament() {
  const [name, setName] = useState('');
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  const [size, setSize] = useState('8');
  const create = useCreateTournament();
  return (
    <>
      <SectionTitle>{t('Host a tournament')}</SectionTitle>
      <TextField label={t('Name')} value={name} onChangeText={setName} maxLength={60} />
      <TimeControlPicker value={timeControl} onChange={setTimeControl} />
      <Segmented
        label={t('Up to')}
        options={SIZES.map((n) => ({
          value: n,
          label: plural(Number(n), '{count} player', '{count} players'),
        }))}
        value={size}
        onChange={setSize}
      />
      {create.error !== null && <Notice tone="error">{describeError(create.error)}</Notice>}
      <Button
        title={t('Create the tournament')}
        busy={create.isPending}
        disabled={name.trim() === ''}
        onPress={() =>
          create.mutate(
            { name: name.trim(), time_control: timeControl, max_players: Number(size) },
            { onSuccess: (made) => router.push(`/tournament/${made.code}`) },
          )
        }
      />
    </>
  );
}

function MyTournaments() {
  const mine = useTournaments();
  return (
    <>
      <SectionTitle>{t('Your tournaments')}</SectionTitle>
      {mine.error !== null ? (
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data === undefined ? (
        <Loading label={t('Loading your tournaments')} />
      ) : mine.data.length === 0 ? (
        <Hint>{t('You are not in any tournament yet. Join one with a link from a friend.')}</Hint>
      ) : (
        mine.data.map((tour) => (
          <Card key={tour.code}>
            <Text style={styles.name}>{tour.name}</Text>
            <Text style={styles.muted}>
              {t('{time} · hosted by {name} · {status}', {
                time: tour.time_control,
                name: tour.host.username,
                status: tournamentStatusText(tour),
              })}
            </Text>
            <Button
              title={t('Open {name}', { name: tour.name })}
              label={t('Open')}
              variant="secondary"
              compact
              onPress={() => router.push(`/tournament/${tour.code}`)}
            />
          </Card>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
