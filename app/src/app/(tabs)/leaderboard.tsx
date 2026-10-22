import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Category, LeaderboardEntry } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { BadgePill } from '@/components/BadgePill';
import { Button } from '@/components/Button';
import { Card, Hint } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { Segmented } from '@/components/Segmented';
import { TextLink } from '@/components/TextLink';
import { t, plural } from '@/i18n';
import { CATEGORIES, defaultCategory } from '@/lobby/format';
import { useLeaderboard, useProfile } from '@/lobby/hooks';
import { colors, radius, shadow, spacing, type } from '@/theme';

/** The top three's medals, each with a number that reads on it (dark on gold and silver). */
const MEDALS = [
  { color: colors.gold, text: colors.goldText },
  { color: colors.silver, text: colors.silverText },
  { color: colors.bronze, text: colors.bronzeText },
] as const;

/** The best players by time control: the top three on a podium, then everyone listed. */
export default function Leaderboard() {
  const me = useMe();
  const profile = useProfile(me.username);
  // Until I pick one: a time control I have a rating in (else Quick).
  const [chosen, setCategory] = useState<Category | null>(null);
  const category = chosen ?? defaultCategory(profile.data?.ratings);
  const board = useLeaderboard(category);
  const found = CATEGORIES.find((c) => c.value === category);
  const label = found === undefined ? '' : t(found.label);
  return (
    <Screen title={t('Leaderboard')} align="top" refreshable>
      <Segmented
        label={t('Time control')}
        options={CATEGORIES.map((c) => ({ ...c, label: t(c.label) }))}
        value={category}
        onChange={setCategory}
      />
      <MyStanding category={category} label={label} />
      {board.error !== null ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : board.data === undefined ? (
        <Loading label={t('Loading the leaderboard')} />
      ) : board.data.length === 0 ? (
        <Card>
          <Hint>
            {t('Nobody yet. Players show after a few rated games, if one was in the last 30 days.')}
          </Hint>
          <Button
            title={t('Play a rated game')}
            variant="secondary"
            onPress={() => router.push('/play?mode=rated')}
          />
        </Card>
      ) : (
        <>
          <View style={styles.podium}>
            {board.data.slice(0, 3).map((entry, i) => (
              <Podium
                key={entry.player.id}
                entry={entry}
                medal={MEDALS[i]!}
                isMe={entry.player.id === me.id}
              />
            ))}
          </View>
          {board.data.length > 3 && (
            <Card>
              {board.data.slice(3).map((entry) => (
                <Row key={entry.player.id} entry={entry} isMe={entry.player.id === me.id} />
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

/** Where I stand in this time control, from my profile: my rank, or why I have none yet. */
function MyStanding({ category, label }: { category: Category; label: string }) {
  const me = useMe();
  // The same query as the leaderboard's own (cached once).
  const profile = useProfile(me.username);
  const rating = profile.data?.ratings[category];
  if (profile.data === undefined) return null;
  const text =
    rating === undefined
      ? t('No {category} rating yet. Play a rated game.', {
          category: label.toLowerCase(),
        })
      : rating.rank !== null
        ? t('You are #{rank}, rated {rating}.', { rank: rating.rank, rating: rating.rating })
        : t(
            'You are rated {rating}. You show after a few more rated games, if one was in the last 30 days.',
            { rating: rating.rating },
          );
  return (
    <View style={styles.mine}>
      <Icon name="me" color={colors.accent} size={20} />
      <Text style={styles.mineText}>{text}</Text>
    </View>
  );
}

function Name({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  return (
    <View style={styles.name}>
      <TextLink href={`/player/${entry.player.username}`}>
        {isMe ? t('{name} (you)', { name: entry.player.username }) : entry.player.username}
      </TextLink>
      <BadgePill badge={entry.player.badge} />
    </View>
  );
}

function Podium({
  entry,
  medal,
  isMe,
}: {
  entry: LeaderboardEntry;
  medal: (typeof MEDALS)[number];
  isMe: boolean;
}) {
  return (
    <View style={[styles.place, isMe && styles.meBox]}>
      <View style={[styles.medal, { backgroundColor: medal.color }]}>
        <Text style={[styles.medalText, { color: medal.text }]}>{entry.rank}</Text>
      </View>
      <Name entry={entry} isMe={isMe} />
      <Text style={styles.bigRating}>{String(entry.rating)}</Text>
      <Text style={styles.games}>{plural(entry.games, '{count} game', '{count} games')}</Text>
    </View>
  );
}

function Row({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  return (
    <View style={[styles.row, isMe && styles.meRow]}>
      <Text style={styles.rank}>{`#${entry.rank}`}</Text>
      {/* The games count goes under the name where the row is narrow. */}
      <View style={styles.who}>
        <Name entry={entry} isMe={isMe} />
        <Text style={styles.games}>{plural(entry.games, '{count} game', '{count} games')}</Text>
      </View>
      <Text style={styles.rating}>{String(entry.rating)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSurface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  mineText: { ...type.small, flex: 1, color: colors.text },
  podium: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  place: {
    flexGrow: 1,
    flexBasis: 160,
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  meBox: { borderWidth: 2, borderColor: colors.accent },
  medal: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { ...type.small, fontWeight: '800' },
  bigRating: { ...type.title, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  meRow: { backgroundColor: colors.accentSurface },
  rank: { ...type.small, width: 44, color: colors.muted },
  who: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
  },
  name: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rating: { ...type.body, fontWeight: '700', color: colors.text },
  games: { ...type.caption, color: colors.muted },
});
