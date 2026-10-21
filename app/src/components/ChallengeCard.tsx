import { StyleSheet, Text, View } from 'react-native';

import type { Challenge, ChallengeAnswer } from '@/api/endpoints';
import { t } from '@/i18n';
import {
  challengeSecondsLeft,
  challengeTerms,
  durationText,
  linkPath,
  shareLink,
} from '@/lobby/format';
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

/** A challenge for me, or mine to a player or by link (`opponent` is null until it is accepted). */
export function ChallengeCard({ challenge, myId, now, onAnswer, pending }: ChallengeCardProps) {
  const { challenger, opponent, code } = challenge;
  const incoming = opponent?.id === myId;
  const other = incoming ? challenger.username : opponent?.username;
  const seconds = challengeSecondsLeft(challenge, now);
  const busy = pending !== null;
  return (
    <Card>
      <Text style={styles.title}>
        {incoming
          ? t('{name} challenges you', { name: other! })
          : other === undefined
            ? t('Your challenge by link')
            : t('Waiting for {name}', { name: other })}
      </Text>
      <Text style={styles.terms}>{challengeTerms(challenge, myId)}</Text>
      {opponent === null && typeof code === 'string' && (
        <Text style={styles.link} selectable aria-label={t('Link to share')}>
          {shareLink(linkPath(code))}
        </Text>
      )}
      <Text style={styles.expiry} aria-live="polite">
        {t('Expires in {time}', {
          time: durationText(seconds),
        })}
      </Text>
      <View style={styles.actions}>
        {incoming ? (
          <>
            <View style={styles.action}>
              <Button
                title={t("Accept {name}'s challenge", { name: other! })}
                label={t('Accept')}
                busy={pending === 'accept'}
                disabled={busy}
                onPress={() => onAnswer('accept')}
              />
            </View>
            <View style={styles.action}>
              <Button
                title={t("Decline {name}'s challenge", { name: other! })}
                label={t('Decline')}
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
              title={
                other === undefined
                  ? t('Cancel the challenge by link')
                  : t('Cancel the challenge to {name}', { name: other })
              }
              label={t('Cancel')}
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
  link: { fontSize: 15, fontWeight: '600', color: colors.accent },
  expiry: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
