import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Category } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Card, Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
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
      {board.error !== null && <Notice tone="error">{describeError(board.error)}</Notice>}
      {board.data === undefined ? (
        board.error === null && <Hint>Loading…</Hint>
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
  name: { flex: 1 },
  rating: { fontSize: 16, fontWeight: '700', color: colors.text },
  games: { width: 76, textAlign: 'right', fontSize: 13, color: colors.muted },
});
