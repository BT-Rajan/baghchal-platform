import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { Profile } from '@/api/endpoints';
import { CATEGORIES, canChallenge, joinedText, presenceText, ratingText } from '@/lobby/format';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';
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
      {!isMe && (
        <Button
          title={`Challenge ${profile.username}`}
          disabled={!canChallenge(profile)}
          onPress={() => router.push(`/challenge/${profile.username}`)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  presence: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { fontSize: 14, color: colors.muted },
  ratings: { flexDirection: 'row', gap: spacing.md },
  rating: { flex: 1 },
  big: { fontSize: 28, fontWeight: '700', color: colors.text },
});
