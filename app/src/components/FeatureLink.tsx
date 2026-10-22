import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Feature } from '@/api/endpoints';
import { has, planFor } from '@/billing/format';
import { useMyPlan, usePlans } from '@/billing/hooks';
import { colors, radius, shadow, spacing, type } from '@/theme';

import { BadgePill } from './BadgePill';
import { focusRing } from './focus';
import { pressedLook, ripple } from './press';
import { Icon, type IconName } from './Icon';

/**
 * A way into one of the app's features: an icon, what it is, and (where the name is not
 * enough) one short line on what it does; a row in the apps' drill-down menus too. A
 * feature the player's plan lacks carries that plan's badge (named by the server's plans, as
 * the Upsell does); its page shows the Upsell itself. As a `tile` it stands on its own, side by
 * side with others (the web's home: its ways to play).
 */
export function FeatureLink({
  icon,
  title,
  text,
  feature,
  tile = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  text?: string;
  /** The paid feature it needs, if any. */
  feature?: Feature;
  /** A card in a row of them, icon above the words, rather than a row in a list. */
  tile?: boolean;
  onPress: () => void;
}) {
  const mine = useMyPlan();
  const plans = usePlans();
  const locked = feature !== undefined && mine.data !== undefined && !has(mine.data, feature);
  const plan = locked && plans.data !== undefined ? planFor(plans.data, feature) : null;
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={onPress}
      {...ripple()}
      style={(state) => [
        styles.tile,
        tile && styles.card,
        pressedLook(state.pressed, styles.pressed),
        focusRing(state),
      ]}
    >
      <View style={[styles.icon, tile && styles.bigIcon]}>
        <Icon name={icon} color={colors.accent} size={tile ? 28 : 24} />
      </View>
      <View style={styles.words}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {plan !== null && <BadgePill badge={plan} />}
        </View>
        {text !== undefined && <Text style={styles.text}>{text}</Text>}
      </View>
      {!tile && <Icon name="chevron" color={colors.muted} size={18} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow,
  },
  card: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    flexGrow: 1,
    flexBasis: 180,
    minHeight: 150,
    padding: spacing.lg,
  },
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.85 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigIcon: { width: 56, height: 56 },
  words: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.label, fontSize: 16, color: colors.text },
  text: { ...type.caption, color: colors.muted },
});
