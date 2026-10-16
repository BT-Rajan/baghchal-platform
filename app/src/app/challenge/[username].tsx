import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import type { Side, TimeControl } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { TIME_CONTROLS } from '@/lobby/format';
import { useCreateChallenge } from '@/lobby/hooks';
import { colors } from '@/theme';

const MODES = [
  { value: 'rated', label: 'Rated' },
  { value: 'casual', label: 'Casual' },
] as const;
const SIDES: readonly { value: Side; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'goat', label: 'Goats' },
  { value: 'tiger', label: 'Tigers' },
];
const TIME_OPTIONS = TIME_CONTROLS.map(({ label }) => ({ value: label, label }));

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ChallengeForm() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  const [mode, setMode] = useState<'rated' | 'casual'>('rated');
  const [side, setSide] = useState<Side>('random');
  const create = useCreateChallenge();

  const send = () =>
    create.mutate(
      {
        opponent: username,
        time_control: timeControl,
        rated: mode === 'rated',
        ...(mode === 'casual' && { side }),
      },
      { onSuccess: leave },
    );

  return (
    <Screen title={`Challenge ${username}`}>
      {create.error !== null && <Notice tone="error">{describeError(create.error)}</Notice>}
      <Segmented
        label="Time control (minutes + seconds per move)"
        options={TIME_OPTIONS}
        value={timeControl}
        onChange={setTimeControl}
      />
      <Segmented label="Game" options={MODES} value={mode} onChange={setMode} />
      {mode === 'rated' ? (
        <Text style={{ fontSize: 14, color: colors.muted }}>
          A rated match is two games: you each play goats once and tigers once.
        </Text>
      ) : (
        <Segmented label="You play" options={SIDES} value={side} onChange={setSide} />
      )}
      <Button title="Send challenge" onPress={send} busy={create.isPending} />
      <Button title="Cancel" variant="secondary" onPress={leave} />
    </Screen>
  );
}
