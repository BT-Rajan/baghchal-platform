import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/api/types';
import { useMe } from '@/auth/session';
import { Body, ErrorText, Loading, Screen } from '@/components/ui';
import { useLeaderboard } from '@/hooks/queries';
import { radius, space, usePalette } from '@/theme';

export default function Leaderboard() {
  const palette = usePalette();
  const me = useMe();
  const [category, setCategory] = useState<Category>('blitz');
  const board = useLeaderboard(category);

  return (
    <Screen>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(['blitz', 'rapid'] as const).map((c) => (
          <Pressable
            key={c}
            accessibilityRole="tab"
            accessibilityState={{ selected: c === category }}
            onPress={() => setCategory(c)}
            style={[
              styles.tab,
              {
                borderColor: palette.accent,
                backgroundColor: c === category ? palette.accent : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                color: c === category ? palette.accentText : palette.text,
                fontWeight: '600',
              }}
            >
              {c === 'blitz' ? 'Blitz' : 'Rapid'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ErrorText error={board.error} />
      {board.isLoading ? (
        <Loading />
      ) : board.data?.length ? (
        board.data.map((entry) => (
          <Link key={entry.player.id} href={`/player/${entry.player.username}`} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Rank ${entry.rank}, ${entry.player.username}, rating ${entry.rating}`}
              style={StyleSheet.flatten([
                styles.row,
                { borderColor: palette.border },
                entry.player.id === me.id && { backgroundColor: palette.lastMove },
              ])}
            >
              <Text style={[styles.rank, { color: palette.muted }]}>{entry.rank}</Text>
              <Text style={[styles.name, { color: palette.text }]}>{entry.player.username}</Text>
              <Text style={{ color: palette.muted }}>{entry.games} games</Text>
              <Text style={[styles.rating, { color: palette.text }]}>{entry.rating}</Text>
            </Pressable>
          </Link>
        ))
      ) : (
        <Body muted>
          Nobody is ranked yet. Players appear here once their rating has settled (after a few rated
          games) and they have played in the last 30 days.
        </Body>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  rank: { width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  rating: { width: 56, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] },
});
