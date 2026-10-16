import { StyleSheet, Text, View } from 'react-native';

import { movePairs } from '@/game/describe';
import { colors, spacing } from '@/theme';

import { Hint } from '../Card';

export function MoveList({ moves }: { moves: readonly string[] }) {
  if (moves.length === 0) return <Hint>No moves yet. Goats move first.</Hint>;
  return (
    <View style={styles.list} aria-label="Moves">
      {movePairs(moves).map(([number, goat, tiger]) => (
        <Text key={number} style={styles.pair}>
          <Text style={styles.number}>{`${number} `}</Text>
          {tiger === undefined ? goat : `${goat}  ${tiger}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  pair: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  number: { color: colors.muted },
});
