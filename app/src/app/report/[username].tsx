import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { ReportReason } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useApi } from '@/auth/session';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { REPORT_REASONS } from '@/lobby/moderation';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Report a player to the moderators: `/report/bob`, or `/report/bob?game=…` from a game. */
export default function ReportForm() {
  const { username, game } = useLocalSearchParams<{ username: string; game?: string }>();
  const api = useApi();
  const [reason, setReason] = useState<ReportReason>('cheating');
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api.report(username, {
        reason,
        details: details.trim(),
        ...(game !== undefined && { game_id: game }),
      }),
  });

  if (send.isSuccess) {
    return (
      <Screen title={`Report ${username}`}>
        <Notice tone="success">Thank you. A moderator will look at your report.</Notice>
        <Button title="Done" onPress={leave} />
      </Screen>
    );
  }
  return (
    <Screen title={`Report ${username}`}>
      {send.error !== null && <Notice tone="error">{describeError(send.error)}</Notice>}
      <Hint>
        {game !== undefined
          ? 'The report includes this game, so moderators can replay it.'
          : 'Reports go to the moderators. The player is not told who reported them.'}
      </Hint>
      <Segmented
        label="What happened?"
        options={REPORT_REASONS}
        value={reason}
        onChange={setReason}
      />
      <TextField
        label="Details (optional)"
        value={details}
        onChangeText={setDetails}
        maxLength={1000}
        multiline
        numberOfLines={4}
      />
      <Button title="Send report" onPress={() => send.mutate()} busy={send.isPending} />
      <Button title="Cancel" variant="secondary" onPress={leave} />
    </Screen>
  );
}
