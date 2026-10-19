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
import { TIME_CONTROLS } from '@/lobby/format';
import { tournamentStatusText } from '@/pro/format';
import { useCreateTournament, useTournaments } from '@/pro/hooks';
import { colors } from '@/theme';

const TIME_OPTIONS = TIME_CONTROLS.map(({ label }) => ({ value: label, label }));
const SIZES = ['3', '4', '5', '6'].map((n) => ({ value: n, label: `${n} players` }));

/** Small tournaments: hosting one (Pro), and the ones I am in. */
export default function Tournaments() {
  const plan = useMyPlan();
  return (
    <Screen align="top" refreshable>
      <Hint>
        A round robin for 3 to 6 friends: everyone plays everyone, once with each side, in casual
        games. Anyone can join with the link.
      </Hint>
      {plan.data !== undefined &&
        (has(plan.data, 'tournaments') ? (
          <NewTournament />
        ) : (
          <Upsell feature="tournaments">Host small tournaments for your friends.</Upsell>
        ))}
      <MyTournaments />
    </Screen>
  );
}

function NewTournament() {
  const [name, setName] = useState('');
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  const [size, setSize] = useState('6');
  const create = useCreateTournament();
  return (
    <>
      <SectionTitle>Host a tournament</SectionTitle>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
      <Segmented
        label="Time control (minutes + seconds per move)"
        options={TIME_OPTIONS}
        value={timeControl}
        onChange={setTimeControl}
      />
      <Segmented label="Up to" options={SIZES} value={size} onChange={setSize} />
      {create.error !== null && <Notice tone="error">{describeError(create.error)}</Notice>}
      <Button
        title="Create the tournament"
        busy={create.isPending}
        disabled={name.trim() === ''}
        onPress={() =>
          create.mutate(
            { name: name.trim(), time_control: timeControl, max_players: Number(size) },
            { onSuccess: (t) => router.push(`/tournament/${t.code}`) },
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
      <SectionTitle>Your tournaments</SectionTitle>
      {mine.error !== null ? (
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data === undefined ? (
        <Loading label="Loading your tournaments" />
      ) : mine.data.length === 0 ? (
        <Hint>You are not in any tournament yet. Join one with a link from a friend.</Hint>
      ) : (
        mine.data.map((t) => (
          <Card key={t.code}>
            <Text style={styles.name}>{t.name}</Text>
            <Text style={styles.muted}>
              {`${t.time_control} · hosted by ${t.host.username} · ${tournamentStatusText(t)}`}
            </Text>
            <Button
              title={`Open ${t.name}`}
              label="Open"
              variant="secondary"
              compact
              onPress={() => router.push(`/tournament/${t.code}`)}
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
