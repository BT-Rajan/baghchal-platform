import { StyleSheet, Text, View } from 'react-native';

import type { Challenge, ChallengeAnswer } from '@/api/endpoints';
import { challengeSecondsLeft, challengeTerms } from '@/lobby/format';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';

export interface ChallengeCardProps {
  challenge: Challenge;
  myId: string;
  now: number;
  onAnswer: (answer: ChallengeAnswer) => void;
  /** The answer being sent, if any. */
  pending: ChallengeAnswer | null;
}

export function ChallengeCard({ challenge, myId, now, onAnswer, pending }: ChallengeCardProps) {
  const incoming = challenge.opponent.id === myId;
  const other = incoming ? challenge.challenger : challenge.opponent;
  const seconds = challengeSecondsLeft(challenge, now);
  const busy = pending !== null;
  return (
    <Card>
      <Text style={styles.title}>
        {incoming ? `${other.username} challenges you` : `Waiting for ${other.username}`}
      </Text>
      <Text style={styles.terms}>{challengeTerms(challenge, myId)}</Text>
      <Text style={styles.expiry} aria-live="polite">{`Expires in ${seconds} s`}</Text>
      <View style={styles.actions}>
        {incoming ? (
          <>
            <View style={styles.action}>
              <Button
                title={`Accept ${other.username}'s challenge`}
                label="Accept"
                busy={pending === 'accept'}
                disabled={busy}
                onPress={() => onAnswer('accept')}
              />
            </View>
            <View style={styles.action}>
              <Button
                title={`Decline ${other.username}'s challenge`}
                label="Decline"
                variant="secondary"
                busy={pending === 'decline'}
                disabled={busy}
                onPress={() => onAnswer('decline')}
              />
            </View>
          </>
        ) : (
          <View style={styles.action}>
            <Button
              title={`Cancel the challenge to ${other.username}`}
              label="Cancel"
              variant="secondary"
              busy={pending === 'cancel'}
              disabled={busy}
              onPress={() => onAnswer('cancel')}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  terms: { fontSize: 15, color: colors.text },
  expiry: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
