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
 * A way into one of the app's features: an icon, what it is, one line on what it does. A
 * feature the player's plan lacks carries that plan's badge (named by the server's plans, as
 * the Upsell does); its page shows the Upsell itself.
 */
export function FeatureLink({
  icon,
  title,
  text,
  feature,
  onPress,
}: {
  icon: IconName;
  title: string;
  text: string;
  /** The paid feature it needs, if any. */
  feature?: Feature;
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
      style={(state) => [styles.tile, pressedLook(state.pressed, styles.pressed), focusRing(state)]}
    >
      <View style={styles.icon}>
        <Icon name={icon} color={colors.accent} />
      </View>
      <View style={styles.words}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {plan !== null && <BadgePill badge={plan} />}
        </View>
        <Text style={styles.text}>{text}</Text>
      </View>
      <Icon name="chevron" color={colors.muted} size={18} />
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
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.85 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.label, fontSize: 16, color: colors.text },
  text: { ...type.caption, color: colors.muted },
});
