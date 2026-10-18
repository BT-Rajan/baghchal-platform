import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Profile } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { CATEGORIES, canChallenge, joinedText, presenceText, ratingText } from '@/lobby/format';
import { useBlock } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';
import { GameHistory } from './GameHistory';
import { Notice } from './Notice';
import { PresenceDot } from './PlayerRow';

export function ProfileView({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  return (
    <>
      <View style={styles.presence}>
        <PresenceDot online={profile.online} />
        <Text style={styles.muted}>
          {`${presenceText(profile)} · ${joinedText(profile.created_at)}`}
        </Text>
      </View>
      <View style={styles.ratings}>
        {CATEGORIES.map(({ value, label }) => {
          const rating = profile.ratings[value];
          return (
            <View key={value} style={styles.rating}>
              <Card>
                <Text style={styles.muted}>{label}</Text>
                <Text
                  style={styles.big}
                  aria-label={`${label} rating ${rating ? ratingText(rating) : 'none'}`}
                >
                  {rating ? ratingText(rating) : '–'}
                </Text>
                <Text style={styles.muted}>
                  {rating === undefined
                    ? 'No games yet'
                    : [
                        `${rating.games} ${rating.games === 1 ? 'game' : 'games'}`,
                        rating.rank !== null
                          ? `#${rating.rank}`
                          : rating.provisional
                            ? 'provisional'
                            : null,
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
                </Text>
              </Card>
            </View>
          );
        })}
      </View>
      {!isMe && !profile.blocked && (
        <Button
          title={`Challenge ${profile.username}`}
          disabled={!canChallenge(profile)}
          onPress={() => router.push(`/challenge/${profile.username}`)}
        />
      )}
      {!isMe && <BlockControl username={profile.username} blocked={profile.blocked} />}
      <GameHistory username={profile.username} />
      {!isMe && (
        <Button
          title={`Report ${profile.username}`}
          variant="secondary"
          onPress={() => router.push(`/report/${profile.username}`)}
        />
      )}
    </>
  );
}

/** Block (after a confirmation) or unblock a player. */
function BlockControl({ username, blocked }: { username: string; blocked: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const change = useBlock();
  const run = (block: boolean) =>
    change.mutate({ username, block }, { onSuccess: () => setConfirming(false) });
  return (
    <View style={styles.block}>
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      {blocked ? (
        <>
          <Text style={styles.muted}>
            {`You have blocked ${username}. Neither of you can challenge the other.`}
          </Text>
          <Button
            title={`Unblock ${username}`}
            variant="secondary"
            busy={change.isPending}
            onPress={() => run(false)}
          />
        </>
      ) : confirming ? (
        <>
          <Text style={styles.question}>
            {`Block ${username}? Neither of you will be able to challenge the other, and you ` +
              `will not see each other in the lobby.`}
          </Text>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button
                title={`Yes, block ${username}`}
                busy={change.isPending}
                onPress={() => run(true)}
              />
            </View>
            <View style={styles.cell}>
              <Button title="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
            </View>
          </View>
        </>
      ) : (
        <Button
          title={`Block ${username}`}
          variant="secondary"
          onPress={() => setConfirming(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  presence: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { fontSize: 14, color: colors.muted },
  ratings: { flexDirection: 'row', gap: spacing.md },
  rating: { flex: 1 },
  big: { fontSize: 28, fontWeight: '700', color: colors.text },
  block: { gap: spacing.sm, marginTop: spacing.md },
  question: { fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
});
