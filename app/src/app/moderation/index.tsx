import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { Report, ReportStatus } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { mark, plural, t } from '@/i18n';
import { searchPrefix } from '@/lobby/format';
import { dateTimeText, reasonLabel, reportTitle } from '@/lobby/moderation';
import { colors } from '@/theme';

const STATUSES: readonly { value: ReportStatus; label: string }[] = [
  { value: 'open', label: mark('Open') },
  { value: 'actioned', label: mark('Acted on') },
  { value: 'dismissed', label: mark('Dismissed') },
];

/** The report queue, for moderators. */
export default function ModerationScreen() {
  const api = useApi();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [name, setName] = useState('');
  const reports = useQuery({
    queryKey: queryKeys.modReports(status),
    queryFn: ({ signal }) => api.modReports(status, signal),
  });
  const open = () => {
    const player = searchPrefix(name);
    if (player !== null) router.push(`/moderation/${player}`);
  };
  return (
    <Screen align="top">
      <TextField
        label={t('Look up a player')}
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={open}
      />
      <Button title={t("Open the player's record")} variant="secondary" onPress={open} />
      <SectionTitle>{t('Reports')}</SectionTitle>
      <Segmented
        label={t('Show')}
        options={STATUSES.map(({ value, label }) => ({ value, label: t(label) }))}
        value={status}
        onChange={setStatus}
      />
      {reports.error !== null ? (
        <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
      ) : reports.data === undefined ? (
        <Loading label={t('Loading reports')} />
      ) : reports.data.length === 0 ? (
        <Hint>{status === 'open' ? t('No open reports.') : t('Nothing here yet.')}</Hint>
      ) : (
        reports.data.map((report) => <ReportCard key={report.id} report={report} />)
      )}
    </Screen>
  );
}

function ReportCard({ report }: { report: Report }) {
  const target = report.target.username;
  return (
    <Card>
      <Text style={styles.title}>{reportTitle(report)}</Text>
      <Text style={styles.muted}>
        {t('{reason} · {date}', {
          reason: reasonLabel(report.reason),
          date: dateTimeText(report.created_at),
        })}
      </Text>
      {report.details !== '' && <Text style={styles.text}>{report.details}</Text>}
      {report.open_reports_against_target > 1 && (
        <Text style={styles.text}>
          {plural(
            report.open_reports_against_target,
            '{count} open report about {name}',
            '{count} open reports about {name}',
            { name: target },
          )}
        </Text>
      )}
      {report.game_id !== null && (
        <TextLink href={`/game/${report.game_id}`}>{t('Open the game')}</TextLink>
      )}
      <Button
        title={t('Review {name}', { name: target })}
        compact
        onPress={() => router.push(`/moderation/${target}`)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
});
