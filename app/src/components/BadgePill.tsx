import { StyleSheet, Text } from 'react-native';

import type { Badge } from '@/api/endpoints';
import { BADGE_NAMES } from '@/appearance/catalog';
import { colors, radius } from '@/theme';

/** "PLUS" or "PRO" next to a player's name. */
export function BadgePill({ badge }: { badge: Badge | null | undefined }) {
  if (badge === null || badge === undefined) return null;
  return (
    <Text
      style={[styles.pill, badge === 'pro' && styles.pro]}
      aria-label={`ClawPlay ${badge === 'pro' ? 'Pro' : 'Plus'}`}
    >
      {BADGE_NAMES[badge]}
    </Text>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    color: colors.accentText,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pro: { backgroundColor: colors.text },
});
