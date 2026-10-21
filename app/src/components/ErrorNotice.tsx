import { router } from 'expo-router';
import { View } from 'react-native';

import { describeError, isApiError } from '@/api/errors';
import { t } from '@/i18n';
import { useActiveGames } from '@/lobby/hooks';
import { spacing } from '@/theme';

import { Button } from './Button';
import { Notice } from './Notice';

/**
 * The one way to show an error: the message, and where a refusal has a next step, a button
 * for it (go to the live game, play the computer during a break, make an account, play
 * casual instead, see the open challenges).
 */
export function ErrorNotice({
  error,
  onCasual,
}: {
  error: unknown;
  /** Offered when a rated game is refused but a casual one would do. */
  onCasual?: () => void;
}) {
  if (error === null || error === undefined) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Notice tone="error">{describeError(error)}</Notice>
      <NextStep error={error} onCasual={onCasual} />
    </View>
  );
}

function NextStep({ error, onCasual }: { error: unknown; onCasual: (() => void) | undefined }) {
  if (!isApiError(error)) return null;
  switch (error.code) {
    case 'player_busy':
      return <GoToGame />;
    case 'abort_cooldown':
      return <Step title={t('Play the computer meanwhile')} onPress={() => router.push('/play')} />;
    case 'account_required':
      return <Step title={t('Make a free account')} onPress={() => router.push('/claim')} />;
    case 'rated_match_limit':
    case 'guest_plays_casual':
      return onCasual ? <Step title={t('Play casual instead')} onPress={onCasual} /> : null;
    case 'too_many_challenges':
    case 'challenge_incoming':
      return <Step title={t('See my challenges')} onPress={() => router.navigate('/')} />;
    default:
      return null;
  }
}

function GoToGame() {
  const live = useActiveGames().data?.[0];
  if (live === undefined) return null;
  return <Step title={t('Go to my game')} onPress={() => router.push(`/game/${live.id}`)} />;
}

function Step({ title, onPress }: { title: string; onPress: () => void }) {
  return <Button title={title} variant="secondary" compact onPress={onPress} />;
}
