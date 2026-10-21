import { usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { t } from '@/i18n';
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
  const values = {
    name: from,
    terms: challengeTerms(first, me.id),
    seconds: challengeSecondsLeft(first, now),
  };
  const busy = answer.isPending && answer.variables.id === first.id;
  return (
    <View style={styles.banner}>
      <Text role="status" aria-live="polite" style={styles.text}>
        {incoming.length > 1
          ? t('{name} challenges you: {terms} · {seconds} s (and {count} more in the lobby)', {
              ...values,
              count: incoming.length - 1,
            })
          : t('{name} challenges you: {terms} · {seconds} s', values)}
      </Text>
      {answer.error !== null && <Text style={styles.error}>{describeError(answer.error)}</Text>}
      <View style={styles.actions}>
        <Button
          title={t("Accept {name}'s challenge", { name: from })}
          label={t('Accept')}
          compact
          busy={busy && answer.variables.answer === 'accept'}
          disabled={busy}
          onPress={() => answer.mutate({ id: first.id, answer: 'accept' })}
        />
        <Button
          title={t("Decline {name}'s challenge", { name: from })}
          label={t('Decline')}
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
