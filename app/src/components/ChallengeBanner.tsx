import { usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/auth/session';
import { plural } from '@/i18n';
import { isOpen } from '@/lobby/format';
import { useActiveGames, useAnswerChallenge, useChallenges } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

import { ChallengeCard } from './ChallengeCard';
import { ErrorNotice } from './ErrorNotice';
import { useServerNow } from './useNow';

/**
 * A challenge for me, shown on every screen but Play (which lists them all), so it is not
 * missed while looking at a profile, the leaderboard or a finished game. Hidden during a game of
 * my own: I could not accept it then. The same card as Play's, to accept or decline it.
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
  const more = incoming.length - 1;
  return (
    <View style={styles.banner}>
      <ErrorNotice error={answer.error} />
      <ChallengeCard
        challenge={first}
        myId={me.id}
        now={now}
        pending={
          answer.isPending && answer.variables.id === first.id ? answer.variables.answer : null
        }
        onAnswer={(a) => answer.mutate({ id: first.id, answer: a })}
      />
      {more > 0 && (
        <Text style={styles.more}>
          {plural(more, 'And 1 more challenge on Play.', 'And {count} more challenges on Play.')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  more: { ...type.caption, color: colors.muted },
});
