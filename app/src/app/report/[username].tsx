import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { ReportReason } from '@/api/endpoints';
import { useApi } from '@/auth/session';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { t } from '@/i18n';
import { REPORT_REASONS } from '@/lobby/moderation';
import { ErrorNotice } from '@/components/ErrorNotice';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Report a player to the moderators: `/report/bob`, or `/report/bob?game=…` from a game. */
export default function ReportForm() {
  const { username, game } = useLocalSearchParams<{ username: string; game?: string }>();
  const api = useApi();
  // No reason is suggested: the reporter picks one.
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: (chosen: ReportReason) =>
      api.report(username, {
        reason: chosen,
        details: details.trim(),
        ...(game !== undefined && { game_id: game }),
      }),
  });

  if (send.isSuccess) {
    return (
      <Screen title={t('Report {name}', { name: username })}>
        <Notice tone="success">{t('Thank you. A moderator will look at your report.')}</Notice>
        <Button title={t('Done')} onPress={leave} />
      </Screen>
    );
  }
  return (
    <Screen title={t('Report {name}', { name: username })}>
      <ErrorNotice error={send.error} />
      <Hint>{t('Moderators read it; the player is not told it was you.')}</Hint>
      {game !== undefined && <Hint>{t('Moderators can replay this game.')}</Hint>}
      <Segmented
        label={t('What happened?')}
        options={REPORT_REASONS.map(({ value, label }) => ({ value, label: t(label) }))}
        value={reason}
        onChange={setReason}
      />
      <TextField
        label={t('Details (optional)')}
        value={details}
        onChangeText={setDetails}
        maxLength={1000}
        multiline
        numberOfLines={4}
      />
      <Button
        title={t('Send report')}
        onPress={() => reason !== null && send.mutate(reason)}
        disabled={reason === null}
        busy={send.isPending}
      />
      <Button title={t('Cancel')} variant="secondary" onPress={leave} />
    </Screen>
  );
}
