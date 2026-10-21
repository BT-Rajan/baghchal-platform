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
import { colors, spacing, type } from '@/theme';

import { Button } from './Button';
import { Card, Hint } from './Card';
import { ShareButton } from './ShareButton';

export interface ChallengeCardProps {
  challenge: Challenge;
  myId: string;
  now: number;
  onAnswer: (answer: ChallengeAnswer) => void;
  /** The answer being sent, if any. */
  pending: ChallengeAnswer | null;
  /** The screen's main thing (a link just made): sharing it is the primary action. */
  main?: boolean;
}

/**
 * A challenge for me (by name, or someone's link I opened), or mine to a player or by link
 * (`opponent` is null until it is accepted): the one place to accept, decline, share or cancel
 * one.
 */
export function ChallengeCard({
  challenge,
  myId,
  now,
  onAnswer,
  pending,
  main = false,
}: ChallengeCardProps) {
  const { challenger, opponent, code } = challenge;
  const mine = challenger.id === myId;
  // A link has nobody to decline it: whoever does not want it just leaves it.
  const byLink = opponent === null;
  const incoming = !mine;
  const other = incoming ? challenger.username : opponent?.username;
  const seconds = challengeSecondsLeft(challenge, now);
  const busy = pending !== null;
  const myLink = mine && byLink && typeof code === 'string' ? linkPath(code) : null;
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
      {challenge.tournament !== null && challenge.tournament !== undefined && (
        <Text style={styles.terms}>
          {t('Round {round} of {tournament}', {
            round: challenge.tournament.round,
            tournament: challenge.tournament.name,
          })}
        </Text>
      )}
      {myLink !== null && (
        <Text style={styles.link} selectable aria-label={t('Link to share')}>
          {shareLink(myLink)}
        </Text>
      )}
      <Text style={styles.expiry}>
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
            {!byLink && (
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
            )}
          </>
        ) : (
          <>
            {myLink !== null && (
              <View style={styles.action}>
                <ShareButton path={myLink} variant={main ? 'primary' : 'secondary'} />
              </View>
            )}
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
          </>
        )}
      </View>
      {myLink !== null && <Hint>{t('If you cancel, the link stops working.')}</Hint>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...type.body, fontWeight: '600', color: colors.text },
  terms: { ...type.small, color: colors.text },
  link: { ...type.small, fontWeight: '600', color: colors.link },
  expiry: { ...type.caption, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
