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
import { Confirm } from '@/components/Confirm';
import { FairPlaySection } from '@/components/FairPlaySection';
import { Notice } from '@/components/Notice';
import { PlanAdmin } from '@/components/PlanAdmin';
import { Segmented } from '@/components/Segmented';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useServerNow } from '@/components/useNow';
import { mark, plural, t } from '@/i18n';
import {
  actionText,
  dateTimeText,
  isSuspended,
  reasonLabel,
  reporterText,
  standingText,
} from '@/lobby/moderation';
import { colors, spacing, type } from '@/theme';
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
  const { username, renamed } = useLocalSearchParams<{ username: string; renamed?: string }>();
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
      <Record player={player} tab={tab} onTab={setTab} tabs={tabs} renamedFrom={renamed} />
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
  renamedFrom,
}: {
  player: ModPlayer;
  tab: Tab;
  onTab: (tab: Tab) => void;
  tabs: { value: Tab; label: string }[];
  /** The name this player had before a moderator renamed them, just now. */
  renamedFrom: string | undefined;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const now = useServerNow(60_000);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string>();
  // An action that is hard to undo, waiting for the moderator to confirm it.
  const [confirming, setConfirming] = useState<Action | null>(null);
  // The open report whose card has the reason field (the first one, until another is chosen).
  const [chosenReport, setChosenReport] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(
    renamedFrom === undefined
      ? null
      : t('{old} is now {name}.', { old: renamedFrom, name: player.username }),
  );
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
    onSuccess: (updated, action) => {
      setReason('');
      setNewName('');
      setConfirming(null);
      setChosenReport(null);
      setDone(doneText(action, player.username));
      queryClient.setQueryData(queryKeys.modPlayer(updated.username), updated);
      void queryClient.invalidateQueries({ queryKey: ['mod', 'reports'] });
      if (updated.username !== player.username) {
        router.replace({
          pathname: '/moderation/[username]',
          params: { username: updated.username, renamed: player.username },
        });
      }
    },
  });
  /** Checks there is a reason, then acts (or asks first, for what is hard to undo). */
  const run = (action: Action) => {
    act.reset();
    setDone(null);
    const missing =
      reason.trim() === ''
        ? tellsPlayer(action)
          ? t('Say why; the player is told.')
          : t('Say why.')
        : undefined;
    setReasonError(missing);
    if (missing !== undefined) return;
    if (action.kind === 'suspend' || action.kind === 'rename') setConfirming(action);
    else act.mutate(action);
  };
  const rename = () => {
    const problem = usernameProblem(newName);
    setNameError(problem);
    if (problem === undefined) run({ kind: 'rename', username: newName });
  };
  const confirm = (action: Extract<Action, { kind: 'suspend' | 'rename' }>) => (
    <Confirm
      question={question(action, player.username)}
      confirmTitle={
        action.kind === 'rename' ? t('Rename') : action.days === null ? t('Ban') : t('Suspend')
      }
      busy={act.isPending}
      error={act.error}
      onConfirm={() => act.mutate(action)}
      onCancel={() => {
        act.reset();
        setConfirming(null);
      }}
    />
  );
  const busy = act.isPending ? act.variables : null;
  const failed = act.error === null ? null : act.variables;
  const suspended = (!player.deleted && isSuspended(player, now)) || player.banned;
  const openReports = player.reports.filter((r) => r.status === 'open');
  const reasonCard = chosenReport ?? openReports[0]?.id ?? null;
  const reasonField = (label: string) => (
    <TextField
      label={label}
      value={reason}
      onChangeText={setReason}
      error={reasonError}
      maxLength={500}
    />
  );

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
      <Segmented
        label={t('Show')}
        options={tabs}
        value={tab}
        onChange={(next) => {
          setDone(null);
          onTab(next);
        }}
      />
      {done !== null && <Notice tone="success">{done}</Notice>}
      {tab === 'act' && (
        <>
          {/* Every action asks why. */}
          {reasonField(t('Reason (sent to the player for suspensions and renames)'))}
          {failed?.kind === 'unsuspend' && <ErrorNotice error={act.error} />}
          {suspended ? (
            <Button
              title={t('Lift the suspension')}
              onPress={() => run({ kind: 'unsuspend' })}
              busy={busy?.kind === 'unsuspend'}
            />
          ) : confirming?.kind === 'suspend' ? (
            confirm(confirming)
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
          {confirming?.kind === 'rename' ? (
            confirm(confirming)
          ) : (
            <Button
              title={t('Rename {name}', { name: player.username })}
              variant="secondary"
              onPress={rename}
            />
          )}
        </>
      )}
      {tab === 'reports' && player.reports.length === 0 && <Hint>{t('No reports.')}</Hint>}
      {tab === 'reports' &&
        player.reports.map((report) => {
          const here = report.id === reasonCard;
          return (
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
              {/* Dismissing asks why, in the card being dismissed. */}
              {report.status === 'open' && here && reasonField(t('Why dismiss it?'))}
              {here && failed?.kind === 'dismiss' && <ErrorNotice error={act.error} />}
              {report.status === 'open' && (
                <Button
                  title={t('Dismiss the report from {reporter}', {
                    reporter: reporterText(report),
                  })}
                  label={t('Dismiss')}
                  variant="secondary"
                  compact
                  onPress={() => {
                    if (here) {
                      run({ kind: 'dismiss', reportId: report.id });
                      return;
                    }
                    // Another report: the reason field moves to it, empty.
                    act.reset();
                    setReason('');
                    setReasonError(undefined);
                    setChosenReport(report.id);
                  }}
                  busy={busy?.kind === 'dismiss' && busy.reportId === report.id}
                />
              )}
            </Card>
          );
        })}
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

/** Whether the player is told the reason (suspensions, bans and renames). */
function tellsPlayer(action: Action): boolean {
  return action.kind === 'suspend' || action.kind === 'rename';
}

/** The question asked before what is hard to undo. */
function question(action: Action, name: string): string {
  if (action.kind === 'rename') {
    return t('Rename {name} to {new}? They are told why.', { name, new: action.username });
  }
  if (action.kind === 'suspend' && action.days !== null) {
    return plural(
      action.days,
      'Suspend {name} for {count} day? They are told why.',
      'Suspend {name} for {count} days? They are told why.',
      { name },
    );
  }
  return t('Ban {name} permanently? They are told why.', { name });
}

/** What was done, once it is. */
function doneText(action: Action, name: string): string {
  switch (action.kind) {
    case 'suspend':
      return action.days === null
        ? t('{name} is banned.', { name })
        : plural(
            action.days,
            '{name} is suspended for {count} day.',
            '{name} is suspended for {count} days.',
            { name },
          );
    case 'unsuspend':
      return t("{name}'s suspension is lifted.", { name });
    case 'rename':
      return t('{old} is now {name}.', { old: name, name: action.username });
    case 'dismiss':
      return t('Report dismissed.');
  }
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.text },
  text: { ...type.small, color: colors.text },
  muted: { ...type.caption, color: colors.muted },
  actions: { gap: spacing.sm },
});
