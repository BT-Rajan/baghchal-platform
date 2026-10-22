import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Profile } from '@/api/endpoints';
import { plural, t } from '@/i18n';
import { CATEGORIES, canChallenge, joinedText, presenceText } from '@/lobby/format';
import { useBlock } from '@/lobby/hooks';
import { useMe } from '@/auth/session';
import { colors, spacing, type } from '@/theme';

import { Achievements } from './Achievements';
import { BadgePill } from './BadgePill';
import { Button } from './Button';
import { Card, Hint } from './Card';
import { Confirm } from './Confirm';
import { ErrorNotice } from './ErrorNotice';
import { FriendControl } from './FriendControl';
import { GameHistory } from './GameHistory';
import { PresenceDot } from './PlayerRow';

export function ProfileView({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const me = useMe();
  const guestViewer = me.role === 'guest';
  return (
    <>
      <View style={styles.presence}>
        <BadgePill badge={profile.badge} />
        <PresenceDot online={profile.online} />
        <Text style={styles.presenceText}>
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
        <Hint>{t('Provisional ratings move faster over the first games.')}</Hint>
      )}
      {/* Guests have no friends; their names start with "guest-". */}
      {!isMe && !profile.blocked && !guestViewer && !profile.username.startsWith('guest-') && (
        <FriendControl username={profile.username} relation={profile.friend ?? 'none'} />
      )}
      {/* Guests cannot challenge anyone by name (a free account can). */}
      {!isMe && !profile.blocked && !guestViewer && (
        <>
          <Button
            title={t('Challenge {name}', { name: profile.username })}
            disabled={!canChallenge(profile)}
            onPress={() => router.push(`/challenge/${profile.username}`)}
          />
          {!canChallenge(profile) && (
            <Hint>
              {profile.playing
                ? t('{name} is in a game.', {
                    name: profile.username,
                  })
                : t('{name} is offline.', {
                    name: profile.username,
                  })}
            </Hint>
          )}
        </>
      )}
      <Achievements username={profile.username} />
      <GameHistory username={profile.username} isMe={isMe} />
      {/* The rarely needed, at the bottom. */}
      {!isMe && (
        <View style={styles.bottom}>
          <BlockControl username={profile.username} blocked={profile.blocked} />
          <Button
            title={t('Report {name}', { name: profile.username })}
            variant="secondary"
            onPress={() => router.push(`/report/${profile.username}`)}
          />
        </View>
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
      {/* While asking, a failure shows in the question. */}
      {!confirming && <ErrorNotice error={change.error} />}
      {blocked ? (
        <>
          <Text style={styles.muted}>
            {t('You blocked {name}.', {
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
      ) : (
        <Confirm
          open={confirming}
          question={t("Block {name}? You won't challenge or see each other.", { name: username })}
          confirmTitle={t('Yes, block {name}', { name: username })}
          busy={change.isPending}
          error={change.error}
          onConfirm={() => run(true)}
          onCancel={() => {
            change.reset();
            setConfirming(false);
          }}
        >
          <Button
            title={t('Block {name}', { name: username })}
            variant="secondary"
            onPress={() => setConfirming(true)}
          />
        </Confirm>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  presence: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  presenceText: { ...type.caption, color: colors.muted, flexShrink: 1 },
  muted: { ...type.caption, color: colors.muted },
  // The cards share a row while each has room, and wrap onto the next line on a narrow screen.
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  rating: { flexGrow: 1, flexBasis: 100 },
  big: { ...type.title, color: colors.text },
  block: { gap: spacing.sm },
  bottom: { gap: spacing.sm, marginTop: spacing.md },
});
