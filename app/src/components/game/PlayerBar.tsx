import { StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { formatClock, remainingMs } from '@/game/clock';
import { SIDE_PLURAL, isComputer, nameOf, playerOf, ratingChangeText } from '@/game/describe';
import { t } from '@/i18n';
import { colors, radius, spaced, spacing, type } from '@/theme';

import { BadgePill } from '../BadgePill';
import { useServerNow } from '../useNow';
import { TextLink } from '../TextLink';

const LOW_TIME_MS = 20_000;

/** One player: name, side, rating (and its change once rated), and their clock. */
export function PlayerBar({
  game,
  side,
  isMe,
  emote = null,
}: {
  game: Game;
  side: Piece;
  isMe: boolean;
  /** A quick message this player just sent, shown for a moment. */
  emote?: string | null;
}) {
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
              {isMe ? t('{name} (you)', { name: player.username }) : player.username}
            </TextLink>
            <BadgePill badge={player.badge} />
          </View>
        )}
        {toMove && (
          // Letters spaced apart, except in a joined script (Arabic).
          <Text style={[styles.toMoveTag, { letterSpacing: spaced(0.8) }]} aria-hidden>
            {t('TO MOVE')}
          </Text>
        )}
        {emote !== null && (
          <Text style={styles.emote} aria-live="polite">
            {emote}
          </Text>
        )}
        <Text style={styles.meta}>
          {[t(SIDE_PLURAL[side]), String(rating.rating), change]
            .filter((x) => x !== null)
            .join(' · ')}
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
      aria-label={
        side === 'goat'
          ? t('Goats clock {time}', { time: text })
          : t('Tigers clock {time}', { time: text })
      }
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
  emote: {
    alignSelf: 'flex-start',
    ...type.label,
    fontWeight: '700',
    color: colors.inkText,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  toMoveTag: {
    alignSelf: 'flex-start',
    ...type.caption,
    fontWeight: '800',
    color: colors.accentText,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  who: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...type.small, fontWeight: '600', color: colors.text, paddingVertical: 10 },
  meta: { ...type.caption, color: colors.muted },
  clock: {
    // Digits read left to right in every language.
    direction: 'ltr',
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
  time: { ...type.clock, color: colors.text, fontVariant: ['tabular-nums'] },
  runningText: { color: colors.inkText },
});
