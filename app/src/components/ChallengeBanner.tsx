import { usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { challengeSecondsLeft, challengeTerms, isOpen } from '@/lobby/format';
import { useActiveGames, useAnswerChallenge, useChallenges } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { useServerNow } from './useNow';

/**
 * A challenge for me, shown on every screen but the lobby (which lists them all), so it is not
 * missed while looking at a profile, the leaderboard or a finished game. Hidden during a game of
 * my own: I could not accept it then.
 */
export function ChallengeBanner() {
  const pathname = usePathname();
  const me = useMe();
  const now = useServerNow();
  const challenges = useChallenges();
  const games = useActiveGames();
  const answer = useAnswerChallenge();
  if (pathname === '/' || (games.data?.length ?? 0) > 0) return null;
  const incoming = challenges.data?.incoming.filter((c) => isOpen(c, now)) ?? [];
  const first = incoming[0];
  if (first === undefined) return null;
  const from = first.challenger.username;
  const more = incoming.length > 1 ? ` (and ${incoming.length - 1} more in the lobby)` : '';
  const busy = answer.isPending && answer.variables.id === first.id;
  return (
    <View style={styles.banner}>
      <Text role="status" aria-live="polite" style={styles.text}>
        {`${from} challenges you: ${challengeTerms(first, me.id)} · ` +
          `${challengeSecondsLeft(first, now)} s${more}`}
      </Text>
      {answer.error !== null && <Text style={styles.error}>{describeError(answer.error)}</Text>}
      <View style={styles.actions}>
        <Button
          title={`Accept ${from}'s challenge`}
          label="Accept"
          compact
          busy={busy && answer.variables.answer === 'accept'}
          disabled={busy}
          onPress={() => answer.mutate({ id: first.id, answer: 'accept' })}
        />
        <Button
          title={`Decline ${from}'s challenge`}
          label="Decline"
          variant="secondary"
          compact
          busy={busy && answer.variables.answer === 'decline'}
          disabled={busy}
          onPress={() => answer.mutate({ id: first.id, answer: 'decline' })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  text: { fontSize: 15, fontWeight: '600', color: colors.text },
  error: { fontSize: 14, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
