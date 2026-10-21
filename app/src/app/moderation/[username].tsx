import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ModPlayer } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi, useMe } from '@/auth/session';
import { usernameProblem } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Card, Hint } from '@/components/Card';
import { FairPlaySection } from '@/components/FairPlaySection';
import { PlanAdmin } from '@/components/PlanAdmin';
import { Segmented } from '@/components/Segmented';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useServerNow } from '@/components/useNow';
import { mark, t } from '@/i18n';
import {
  actionText,
  dateTimeText,
  isSuspended,
  reasonLabel,
  reporterText,
  standingText,
} from '@/lobby/moderation';
import { colors, spacing } from '@/theme';
import { ErrorNotice } from '@/components/ErrorNotice';

type Action =
  | { kind: 'suspend'; days: number | null }
  | { kind: 'unsuspend' }
  | { kind: 'rename'; username: string }
  | { kind: 'dismiss'; reportId: string };

type Tab = 'reports' | 'act' | 'history' | 'fair' | 'plan';

const REPORT_STATUSES: Record<ModPlayer['reports'][number]['status'], string> = {
  open: mark('open'),
  actioned: mark('actioned'),
  dismissed: mark('dismissed'),
};

/**
 * One player's record, and what a moderator can do about them: their standing, then one tab
 * at a time (the reports first, as moderators mostly come from one).
 */
export default function ModeratePlayer() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const api = useApi();
  const me = useMe();
  const [tab, setTab] = useState<Tab>('reports');
  const record = useQuery({
    queryKey: queryKeys.modPlayer(username),
    queryFn: ({ signal }) => api.modPlayer(username, signal),
  });
  if (record.error !== null || record.data === undefined) {
    return (
      <Screen title={username} align="top">
        {record.error !== null ? (
          <ErrorState error={record.error} onRetry={() => void record.refetch()} />
        ) : (
          <Loading label={t("Loading the player's record")} />
        )}
      </Screen>
    );
  }
  const player = record.data;
  const actable = !player.deleted && player.role === 'player';
  const tabs: { value: Tab; label: string }[] = [
    { value: 'reports', label: t('Reports ({count})', { count: player.reports.length }) },
    ...(actable ? [{ value: 'act' as const, label: t('Act') }] : []),
    { value: 'history', label: t('History') },
    { value: 'fair', label: t('Fair play') },
    ...(me.role === 'admin' && !player.deleted
      ? [{ value: 'plan' as const, label: t('Plan') }]
      : []),
  ];
  return (
    <Screen title={username} align="top">
      <Record player={player} tab={tab} onTab={setTab} tabs={tabs} />
      {tab === 'fair' && <FairPlaySection username={player.username} />}
      {tab === 'plan' && <PlanAdmin username={player.username} />}
    </Screen>
  );
}

function Record({
  player,
  tab,
  onTab,
  tabs,
}: {
  player: ModPlayer;
  tab: Tab;
  onTab: (tab: Tab) => void;
  tabs: { value: Tab; label: string }[];
}) {
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
    const missing = reason.trim() === '' ? t('Say why; the player is told.') : undefined;
    setReasonError(missing);
    if (missing === undefined) act.mutate(action);
  };
  const rename = () => {
    const problem = usernameProblem(newName);
    setNameError(problem);
    if (problem === undefined) run({ kind: 'rename', username: newName });
  };
  const busy = act.isPending ? act.variables : null;
  const suspended = (!player.deleted && isSuspended(player, now)) || player.banned;

  return (
    <>
      <Card>
        <Text style={styles.title}>{standingText(player, now)}</Text>
        {player.suspension_reason !== null && suspended && (
          <Text style={styles.text}>
            {t('Reason: {reason}', { reason: player.suspension_reason })}
          </Text>
        )}
        <Text style={styles.muted}>
          {t('Joined {date}', { date: dateTimeText(player.created_at) })}
        </Text>
        {player.role === 'moderator' && <Text style={styles.muted}>{t('Moderator')}</Text>}
        {player.role === 'admin' && <Text style={styles.muted}>{t('Admin')}</Text>}
      </Card>
      <Segmented label={t('Show')} options={tabs} value={tab} onChange={onTab} />
      <ErrorNotice error={act.error} />
      {/* Every action asks why: acting, and dismissing a report. */}
      {(tab === 'act' ||
        (tab === 'reports' && player.reports.some((r) => r.status === 'open'))) && (
        <TextField
          label={t('Reason (sent to the player for suspensions and renames)')}
          value={reason}
          onChangeText={setReason}
          error={reasonError}
          maxLength={500}
        />
      )}
      {tab === 'act' && (
        <>
          {suspended ? (
            <Button
              title={t('Lift the suspension')}
              onPress={() => run({ kind: 'unsuspend' })}
              busy={busy?.kind === 'unsuspend'}
            />
          ) : (
            <View style={styles.actions}>
              {[
                { title: t('Suspend for 1 day'), days: 1 },
                { title: t('Suspend for 7 days'), days: 7 },
                { title: t('Ban permanently'), days: null },
              ].map(({ title, days }) => (
                <Button
                  key={String(days)}
                  title={title}
                  variant="secondary"
                  onPress={() => run({ kind: 'suspend', days })}
                  busy={busy?.kind === 'suspend' && busy.days === days}
                />
              ))}
            </View>
          )}
          <TextField
            label={t('New username')}
            value={newName}
            onChangeText={setNewName}
            error={nameError}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            title={t('Rename {name}', { name: player.username })}
            variant="secondary"
            onPress={rename}
            busy={busy?.kind === 'rename'}
          />
        </>
      )}
      {tab === 'reports' && player.reports.length === 0 && <Hint>{t('No reports.')}</Hint>}
      {tab === 'reports' &&
        player.reports.map((report) => (
          <Card key={report.id}>
            <Text style={styles.text}>
              {t('{reason} · from {reporter} · {status}', {
                reason: reasonLabel(report.reason),
                reporter: reporterText(report),
                status: t(REPORT_STATUSES[report.status]),
              })}
            </Text>
            <Text style={styles.muted}>{dateTimeText(report.created_at)}</Text>
            {report.details !== '' && <Text style={styles.text}>{report.details}</Text>}
            {report.game_id !== null && (
              <TextLink href={`/game/${report.game_id}`}>{t('Open the game')}</TextLink>
            )}
            {report.status === 'open' && (
              <Button
                title={t('Dismiss the report from {reporter}', { reporter: reporterText(report) })}
                label={t('Dismiss')}
                variant="secondary"
                compact
                onPress={() => run({ kind: 'dismiss', reportId: report.id })}
                busy={busy?.kind === 'dismiss' && busy.reportId === report.id}
              />
            )}
          </Card>
        ))}
      {tab === 'history' && player.actions.length === 0 && (
        <Hint>{t('No moderator has acted on this player.')}</Hint>
      )}
      {tab === 'history' &&
        player.actions.map((action) => (
          <Card key={`${action.created_at}-${action.action}`}>
            <Text style={styles.muted}>{actionText(action)}</Text>
            <Text style={styles.text}>{action.reason}</Text>
          </Card>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  actions: { gap: spacing.sm },
});
