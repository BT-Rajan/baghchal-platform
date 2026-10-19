import { StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { formatClock, remainingMs } from '@/game/clock';
import { SIDE_PLURAL, isComputer, nameOf, playerOf, ratingChangeText } from '@/game/describe';
import { colors, radius, spacing } from '@/theme';

import { BadgePill } from '../BadgePill';
import { useServerNow } from '../useNow';
import { TextLink } from '../TextLink';

const LOW_TIME_MS = 20_000;

/** One player: name, side, rating (and its change once rated), and their clock. */
export function PlayerBar({ game, side, isMe }: { game: Game; side: Piece; isMe: boolean }) {
  const player = playerOf(game, side);
  const rating = game.ratings[side];
  const change = game.rated ? ratingChangeText(rating.change) : null;
  const toMove = game.status === 'active' && game.side_to_move === side;
  return (
    <View style={[styles.bar, toMove && styles.toMove]}>
      <View style={styles.who}>
        {isComputer(game, side) ? (
          <Text style={styles.name}>{nameOf(game, side)}</Text>
        ) : (
          <View style={styles.nameRow}>
            <TextLink href={`/player/${player.username}`}>
              {isMe ? `${player.username} (you)` : player.username}
            </TextLink>
            <BadgePill badge={player.badge} />
          </View>
        )}
        {toMove && (
          <Text style={styles.toMoveTag} aria-hidden>
            TO MOVE
          </Text>
        )}
        <Text style={styles.meta}>
          {[SIDE_PLURAL[side], String(rating.rating), change].filter((x) => x !== null).join(' · ')}
        </Text>
      </View>
      <Clock game={game} side={side} />
    </View>
  );
}

function Clock({ game, side }: { game: Game; side: Piece }) {
  const running = game.status === 'active' && game.clocks.running === side;
  const now = useServerNow(running ? 100 : 1000);
  const ms = remainingMs(game, side, now);
  const text = formatClock(ms);
  return (
    <View
      role="timer"
      aria-label={`${SIDE_PLURAL[side]} clock ${text}`}
      style={[styles.clock, running && styles.running, running && ms < LOW_TIME_MS && styles.low]}
    >
      <Text style={[styles.time, running && styles.runningText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toMove: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  toMoveTag: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.accentText,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  who: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, paddingVertical: 10 },
  meta: { fontSize: 13, color: colors.muted },
  clock: {
    minWidth: 92,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  running: { backgroundColor: colors.ink, borderColor: colors.ink },
  low: { backgroundColor: colors.danger, borderColor: colors.danger },
  time: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  runningText: { color: colors.inkText },
});
