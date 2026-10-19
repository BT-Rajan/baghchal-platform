import { StyleSheet, Text, View } from 'react-native';

import type { Game, Side } from '@/api/types';
import { formatClock, remainingMs, type ClockSync } from '@/game/clock';
import { useNow } from '@/hooks/use-now';
import { radius, space, usePalette } from '@/theme';

function change(value: number | null): string {
  if (value === null) return '';
  return value >= 0 ? ` (+${value})` : ` (${value})`;
}

/** One player's name, side, rating and clock. Only a running clock re-renders as it ticks. */
export function PlayerBar({ game, side, clock }: { game: Game; side: Side; clock: ClockSync }) {
  const palette = usePalette();
  const player = game[side];
  const rating = game.ratings[side];
  const running = game.status === 'active' && game.clocks.running === side;
  const serverNow = clock.serverNow(useNow(100, running));
  const ms = remainingMs(game.clocks, game.server_time, side, serverNow);
  const low = ms < 20_000;
  const toMove = game.status === 'active' && game.side_to_move === side;
  return (
    <View
      style={[
        styles.bar,
        {
          borderColor: toMove ? palette.highlight : palette.border,
          backgroundColor: palette.surface,
        },
      ]}
    >
      <Text style={styles.glyph} accessible={false}>
        {side === 'goat' ? '🐐' : '🐯'}
      </Text>
      <View style={styles.who}>
        <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
          {player.username}
        </Text>
        <Text style={{ color: palette.muted }}>
          {side === 'goat' ? 'Goats' : 'Tigers'}
          {game.rated ? ` · ${rating.rating}${change(rating.change)}` : ' · casual'}
        </Text>
      </View>
      <Text
        accessibilityLabel={`${player.username} clock ${formatClock(ms)}`}
        accessibilityLiveRegion={low && running ? 'polite' : 'none'}
        style={[
          styles.clock,
          {
            color: running ? palette.accentText : palette.text,
            backgroundColor: running ? (low ? palette.danger : palette.accent) : 'transparent',
            borderColor: palette.border,
          },
        ]}
      >
        {formatClock(ms)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderWidth: 2,
    borderRadius: radius.md,
  },
  glyph: { fontSize: 26 },
  who: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700' },
  clock: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    minWidth: 92,
    textAlign: 'center',
    overflow: 'hidden',
  },
});
