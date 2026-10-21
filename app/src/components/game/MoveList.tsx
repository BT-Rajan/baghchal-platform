import { Pressable, StyleSheet, Text, View } from 'react-native';

import { movePairs } from '@/game/describe';
import { t } from '@/i18n';
import { colors, radius, spacing, type } from '@/theme';

import { Hint } from '../Card';
import { focusRing } from '../focus';
import { ripple } from '../press';

/**
 * The moves in pairs ("1. a2  a1-b1"). With `onShow` (a finished game), each move is a button
 * that shows the position after it, and `current` marks the one shown.
 */
export function MoveList({
  moves,
  current,
  onShow,
}: {
  moves: readonly string[];
  current?: number;
  onShow?: (ply: number) => void;
}) {
  if (moves.length === 0) return <Hint>{t('No moves yet. Goats move first.')}</Hint>;
  const move = (text: string | undefined, ply: number) => {
    if (text === undefined) return null;
    if (onShow === undefined) return <Text style={styles.move}>{text}</Text>;
    const selected = ply === current;
    return (
      <Pressable
        role="button"
        aria-label={t('Show move {ply}: {move}', { ply, move: text })}
        aria-pressed={selected}
        onPress={() => onShow(ply)}
        {...ripple(selected)}
        style={(state) => [styles.tap, selected && styles.selected, focusRing(state)]}
      >
        <Text style={[styles.move, selected && styles.selectedText]}>{text}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.list} aria-label={t('Moves')}>
      {movePairs(moves).map(([number, goat, tiger], i) => (
        <View key={number} style={styles.pair}>
          <Text style={styles.number}>{number}</Text>
          {move(goat, 2 * i + 1)}
          {move(tiger, 2 * i + 2)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Moves are written in coordinates ("c3-d4"): left to right in every language.
  list: {
    direction: 'ltr',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  pair: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  number: { ...type.small, color: colors.muted, fontVariant: ['tabular-nums'] },
  move: { ...type.small, color: colors.text, fontVariant: ['tabular-nums'] },
  // A finger-sized target around each move.
  tap: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: colors.ink },
  selectedText: { color: colors.inkText, fontWeight: '700' },
});
