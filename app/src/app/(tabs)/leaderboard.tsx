import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { BadgePill } from '@/components/BadgePill';
import { Card, Hint } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { Segmented } from '@/components/Segmented';
import { TextLink } from '@/components/TextLink';
import { CATEGORIES } from '@/lobby/format';
import { useLeaderboard } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

export default function Leaderboard() {
  const me = useMe();
  const [category, setCategory] = useState<Category>('blitz');
  const board = useLeaderboard(category);
  return (
    <Screen title="Leaderboard" align="top">
      <Segmented
        label="Time control"
        options={CATEGORIES}
        value={category}
        onChange={setCategory}
      />
      {board.error !== null ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : board.data === undefined ? (
        <Loading label="Loading the leaderboard" />
      ) : board.data.length === 0 ? (
        <Hint>
          Nobody is listed yet. Players appear once their rating has settled and they have played a
          rated game in the last 30 days.
        </Hint>
      ) : (
        <Card>
          {board.data.map((entry) => (
            <View key={entry.player.id} style={styles.row}>
              <Text style={styles.rank}>{`#${entry.rank}`}</Text>
              <View style={styles.name}>
                <TextLink href={`/player/${entry.player.username}`}>
                  {entry.player.id === me.id
                    ? `${entry.player.username} (you)`
                    : entry.player.username}
                </TextLink>
                <BadgePill badge={entry.player.badge} />
              </View>
              <Text style={styles.rating}>{String(entry.rating)}</Text>
              <Text style={styles.games}>{`${entry.games} games`}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 44, fontSize: 15, color: colors.muted },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rating: { fontSize: 16, fontWeight: '700', color: colors.text },
  games: { width: 76, textAlign: 'right', fontSize: 13, color: colors.muted },
});
