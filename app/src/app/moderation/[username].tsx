import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ModPlayer } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { useApi, useMe } from '@/auth/session';
import { usernameProblem } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { FairPlaySection } from '@/components/FairPlaySection';
import { Notice } from '@/components/Notice';
import { PlanAdmin } from '@/components/PlanAdmin';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useServerNow } from '@/components/useNow';
import {
  actionText,
  dateTimeText,
  reasonLabel,
  reporterText,
  standingText,
} from '@/lobby/moderation';
import { colors, spacing } from '@/theme';

type Action =
  | { kind: 'suspend'; days: number | null }
  | { kind: 'unsuspend' }
  | { kind: 'rename'; username: string }
  | { kind: 'dismiss'; reportId: string };

/** One player's record, and what a moderator can do about them. */
export default function ModeratePlayer() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const api = useApi();
  const me = useMe();
  const record = useQuery({
    queryKey: queryKeys.modPlayer(username),
    queryFn: ({ signal }) => api.modPlayer(username, signal),
  });
  return (
    <Screen title={username} align="top">
      {record.error !== null ? (
        <ErrorState error={record.error} onRetry={() => void record.refetch()} />
      ) : record.data === undefined ? (
        <Loading label="Loading the player's record" />
      ) : (
        <>
          <Record player={record.data} />
          <FairPlaySection username={record.data.username} />
        </>
      )}
      {me.role === 'admin' && record.data !== undefined && !record.data.deleted && (
        <PlanAdmin username={record.data.username} />
      )}
    </Screen>
  );
}

function Record({ player }: { player: ModPlayer }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const now = useServerNow(60_000);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const act = useMutation({
    mutationFn: async (action: Action): Promise<ModPlayer> => {
      const why = reason.trim();
      switch (action.kind) {
        case 'suspend':
          return api.suspend(player.username, action.days, why);
        case 'unsuspend':
          return api.unsuspend(player.username, why);
        case 'rename':
          return api.rename(player.username, action.username, why);
        case 'dismiss':
          await api.dismissReport(action.reportId, why);
          return api.modPlayer(player.username);
      }
    },
    onSuccess: (updated) => {
      setReason('');
      setNewName('');
      queryClient.setQueryData(queryKeys.modPlayer(updated.username), updated);
      void queryClient.invalidateQueries({ queryKey: ['mod', 'reports'] });
      if (updated.username !== player.username) router.replace(`/moderation/${updated.username}`);
    },
  });
  const run = (action: Action) => {
    act.reset();
    const missing = reason.trim() === '' ? 'Say why; the player is told.' : undefined;
    setReasonError(missing);
    if (missing === undefined) act.mutate(action);
  };
  const rename = () => {
    const problem = usernameProblem(newName);
    setNameError(problem);
    if (problem === undefined) run({ kind: 'rename', username: newName });
  };
  const busy = act.isPending ? act.variables : null;
  const suspended = standingText(player, now).startsWith('Suspended') || player.banned;

  return (
    <>
      <Card>
        <Text style={styles.title}>{standingText(player, now)}</Text>
        {player.suspension_reason !== null && suspended && (
          <Text style={styles.text}>{`Reason: ${player.suspension_reason}`}</Text>
        )}
        <Text style={styles.muted}>{`Joined ${dateTimeText(player.created_at)}`}</Text>
        {player.role === 'moderator' && <Text style={styles.muted}>Moderator</Text>}
        {player.role === 'admin' && <Text style={styles.muted}>Admin</Text>}
      </Card>
      {act.error !== null && <Notice tone="error">{describeError(act.error)}</Notice>}
      {!player.deleted && player.role === 'player' && (
        <>
          <SectionTitle>Act</SectionTitle>
          <TextField
            label="Reason (sent to the player for suspensions and renames)"
            value={reason}
            onChangeText={setReason}
            error={reasonError}
            maxLength={500}
          />
          {suspended ? (
            <Button
              title="Lift the suspension"
              onPress={() => run({ kind: 'unsuspend' })}
              busy={busy?.kind === 'unsuspend'}
            />
          ) : (
            <View style={styles.actions}>
              {[
                { title: 'Suspend for 1 day', days: 1 },
                { title: 'Suspend for 7 days', days: 7 },
                { title: 'Ban permanently', days: null },
              ].map(({ title, days }) => (
                <Button
                  key={title}
                  title={title}
                  variant="secondary"
                  onPress={() => run({ kind: 'suspend', days })}
                  busy={busy?.kind === 'suspend' && busy.days === days}
                />
              ))}
            </View>
          )}
          <TextField
            label="New username"
            value={newName}
            onChangeText={setNewName}
            error={nameError}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            title={`Rename ${player.username}`}
            variant="secondary"
            onPress={rename}
            busy={busy?.kind === 'rename'}
          />
        </>
      )}
      <SectionTitle>Reports about this player</SectionTitle>
      {player.reports.length === 0 ? (
        <Hint>No reports.</Hint>
      ) : (
        player.reports.map((report) => (
          <Card key={report.id}>
            <Text style={styles.text}>
              {`${reasonLabel(report.reason)} · from ${reporterText(report)} · ${report.status}`}
            </Text>
            <Text style={styles.muted}>{dateTimeText(report.created_at)}</Text>
            {report.details !== '' && <Text style={styles.text}>{report.details}</Text>}
            {report.game_id !== null && (
              <TextLink href={`/game/${report.game_id}`}>Open the game</TextLink>
            )}
            {report.status === 'open' && (
              <Button
                title={`Dismiss the report from ${reporterText(report)}`}
                label="Dismiss"
                variant="secondary"
                compact
                onPress={() => run({ kind: 'dismiss', reportId: report.id })}
                busy={busy?.kind === 'dismiss' && busy.reportId === report.id}
              />
            )}
          </Card>
        ))
      )}
      <SectionTitle>History</SectionTitle>
      {player.actions.length === 0 ? (
        <Hint>No moderator has acted on this player.</Hint>
      ) : (
        player.actions.map((action) => (
          <Card key={`${action.created_at}-${action.action}`}>
            <Text style={styles.muted}>{actionText(action)}</Text>
            <Text style={styles.text}>{action.reason}</Text>
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
  actions: { gap: spacing.sm },
});
