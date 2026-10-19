import { Pressable, StyleSheet } from 'react-native';

import { colors, radius } from '@/theme';

import { focusRing } from './focus';
import { pressedLook, ripple } from './press';
import { Icon, type IconName } from './Icon';

/**
 * A small round button for a utility action (sound on or off), so it does not compete with
 * the screen's main action. `title` is its accessible name.
 */
export function IconButton({
  icon,
  title,
  onPress,
  selected,
}: {
  icon: IconName;
  title: string;
  onPress: () => void;
  /** For a toggle: whether it is on. */
  selected?: boolean;
}) {
  return (
    <Pressable
      role="button"
      aria-label={title}
      {...(selected !== undefined && { 'aria-pressed': selected })}
      onPress={onPress}
      {...ripple()}
      style={(state) => [
        styles.button,
        pressedLook(state.pressed, styles.pressed),
        focusRing(state),
      ]}
    >
      <Icon name={icon} color={colors.text} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44 points: the smallest comfortable touch target.
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.subtle,
    overflow: 'hidden',
  },
  pressed: { backgroundColor: colors.border, transform: [{ scale: 0.95 }] },
});
