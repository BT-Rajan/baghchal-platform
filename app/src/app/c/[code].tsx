import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useServerNow } from '@/components/useNow';
import { challengeTerms, isOpen } from '@/lobby/format';
import { useAcceptLink, useAnswerChallenge, useLinkChallenge } from '@/lobby/hooks';
import { colors } from '@/theme';

/** A challenge by link, opened from the link: accept and play, or (my own) share or cancel it. */
export default function LinkChallenge() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useMe();
  const now = useServerNow();
  const link = useLinkChallenge(code);
  const accept = useAcceptLink(code);
  const answer = useAnswerChallenge();
  const c = link.data;
  const mine = c !== undefined && c.challenger.id === me.id;
  const gameId = c?.game_id ?? null;
  // Only the two players can open the game.
  const myGame = mine || c?.opponent?.id === me.id ? gameId : null;
  return (
    <Screen title="Challenge" align="top">
      {link.error !== null ? (
        <ErrorState error={link.error} onRetry={() => void link.refetch()} />
      ) : c === undefined ? (
        <Loading label="Loading the challenge" />
      ) : !isOpen(c, now) ? (
        <Hint>
          {myGame !== null
            ? 'The challenge was accepted.'
            : 'This challenge is closed. Ask your friend for a new link.'}
        </Hint>
      ) : mine ? (
        <>
          {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
          <ChallengeCard
            challenge={c}
            myId={me.id}
            now={now}
            pending={answer.isPending ? answer.variables.answer : null}
            onAnswer={(a) =>
              answer.mutate({ id: c.id, answer: a }, { onSuccess: () => void link.refetch() })
            }
          />
        </>
      ) : (
        <Card>
          <Text style={styles.title}>{`${c.challenger.username} challenges you`}</Text>
          <Text style={styles.text}>{challengeTerms(c, me.id)}</Text>
          {accept.error !== null && <Notice tone="error">{describeError(accept.error)}</Notice>}
          <Button title="Accept and play" busy={accept.isPending} onPress={() => accept.mutate()} />
        </Card>
      )}
      {myGame !== null && (
        <Button
          title="Go to the game"
          variant="secondary"
          onPress={() => router.push(`/game/${myGame}`)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
});
