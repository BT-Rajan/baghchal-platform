import { Platform, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

/**
 * How a pressable answers a touch: Android's own ripple there, and the pressed style given
 * elsewhere (web and iOS have no ripple). Spread `ripple()` into the Pressable and wrap its
 * pressed style in `pressedLook`.
 */
export function ripple(onDark = false): Pick<PressableProps, 'android_ripple'> {
  return Platform.OS === 'android'
    ? { android_ripple: { color: onDark ? colors.rippleOnDark : colors.ripple } }
    : {};
}

export function pressedLook(pressed: boolean, style: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  return pressed && Platform.OS !== 'android' ? style : null;
}
