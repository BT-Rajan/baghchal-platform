import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Profile } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { plural, t } from '@/i18n';
import { CATEGORIES, canChallenge, joinedText, presenceText } from '@/lobby/format';
import { useBlock } from '@/lobby/hooks';
import { useMe } from '@/auth/session';
import { colors, spacing } from '@/theme';

import { Achievements } from './Achievements';
import { BadgePill } from './BadgePill';
import { Button } from './Button';
import { Card, Hint } from './Card';
import { Confirm } from './Confirm';
import { FriendControl } from './FriendControl';
import { GameHistory } from './GameHistory';
import { Notice } from './Notice';
import { PresenceDot } from './PlayerRow';

export function ProfileView({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const me = useMe();
  const guestViewer = me.role === 'guest';
  return (
    <>
      <View style={styles.presence}>
        <BadgePill badge={profile.badge} />
        <PresenceDot online={profile.online} />
        <Text style={styles.muted}>
          {t('{presence} · {joined}', {
            presence: presenceText(profile),
            joined: joinedText(profile.created_at),
          })}
        </Text>
      </View>
      <View style={styles.ratings}>
        {CATEGORIES.map(({ value, label }) => {
          const rating = profile.ratings[value];
          return (
            <View key={value} style={styles.rating}>
              <Card>
                <Text style={styles.muted}>{t(label)}</Text>
                <Text
                  style={styles.big}
                  aria-label={
                    rating
                      ? t('{category} rating {rating}', {
                          category: t(label),
                          rating: rating.rating,
                        })
                      : t('{category} rating none', { category: t(label) })
                  }
                >
                  {rating ? String(rating.rating) : '–'}
                </Text>
                <Text style={styles.muted}>
                  {rating === undefined
                    ? t('No games yet')
                    : rating.rank !== null
                      ? plural(rating.games, '{count} game · #{rank}', '{count} games · #{rank}', {
                          rank: rating.rank,
                        })
                      : rating.provisional
                        ? plural(
                            rating.games,
                            '{count} game · provisional',
                            '{count} games · provisional',
                          )
                        : plural(rating.games, '{count} game', '{count} games')}
                </Text>
              </Card>
            </View>
          );
        })}
      </View>
      {Object.values(profile.ratings).some((r) => r?.provisional) && (
        <Hint>
          {t('A provisional rating is still settling: it moves faster over the first games.')}
        </Hint>
      )}
      {/* Guests have no friends; their names start with "guest-". */}
      {!isMe &&
        !profile.blocked &&
        guestViewer === false &&
        me.plays_people &&
        !profile.username.startsWith('guest-') && (
          <FriendControl username={profile.username} relation={profile.friend ?? 'none'} />
        )}
      {!isMe && !profile.blocked && (
        <Button
          title={t('Challenge {name}', { name: profile.username })}
          disabled={!me.plays_people || !canChallenge(profile)}
          onPress={() => router.push(`/challenge/${profile.username}`)}
        />
      )}
      {!isMe && <BlockControl username={profile.username} blocked={profile.blocked} />}
      <Achievements username={profile.username} />
      <GameHistory username={profile.username} />
      {!isMe && (
        <Button
          title={t('Report {name}', { name: profile.username })}
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
            {t('You have blocked {name}. Neither of you can challenge the other.', {
              name: username,
            })}
          </Text>
          <Button
            title={t('Unblock {name}', { name: username })}
            variant="secondary"
            busy={change.isPending}
            onPress={() => run(false)}
          />
        </>
      ) : confirming ? (
        <Confirm
          question={t(
            'Block {name}? Neither of you will be able to challenge the other, and you will not see each other in the lobby.',
            { name: username },
          )}
          confirmTitle={t('Yes, block {name}', { name: username })}
          busy={change.isPending}
          onConfirm={() => run(true)}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <Button
          title={t('Block {name}', { name: username })}
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
});
