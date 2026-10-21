import { StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';

import type { PieceSet } from '@/api/endpoints';
import { t } from '@/i18n';
import { colors, radius, spacing, type } from '@/theme';

import { Coin } from './Coin';

const CAPTURES_TO_WIN = 5;

/**
 * The game's tension at a glance: the goats still to come onto the board, and the tigers'
 * captures filling five slots (five wins).
 */
export function PieceCounts({
  inHand,
  captured,
  pieces,
}: {
  inHand: number;
  captured: number;
  pieces: PieceSet;
}) {
  return (
    <View
      accessible
      aria-label={t('Goats to place: {inHand} · Goats captured: {captured} of 5', {
        inHand,
        captured,
      })}
      style={styles.row}
    >
      <View style={styles.group}>
        <View style={styles.coin}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Coin piece="goat" set={pieces} />
          </Svg>
        </View>
        <Text style={styles.number}>{inHand}</Text>
        <Text style={styles.caption}>{t('to place')}</Text>
      </View>
      <View style={styles.group}>
        <View style={styles.slots}>
          {Array.from({ length: CAPTURES_TO_WIN }, (_, i) => (
            <View key={i} style={[styles.slot, i < captured && styles.taken]}>
              {i < captured && (
                <Svg width="100%" height="100%" viewBox="0 0 100 100">
                  <Coin piece="goat" set={pieces} />
                </Svg>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.caption}>{t('captured')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    backgroundColor: colors.subtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  group: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coin: { width: 30, height: 30 },
  number: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  caption: { ...type.caption, color: colors.muted },
  slots: { flexDirection: 'row', gap: 4 },
  slot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.goatShade,
  },
  taken: {
    borderStyle: 'solid',
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
  },
});
