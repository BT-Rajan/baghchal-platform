import { StyleSheet, type PressableStateCallbackType } from 'react-native';

import { colors } from '@/theme';

/**
 * A visible ring while a pressable has keyboard focus. React Native Web passes `focused` to
 * style callbacks (native platforms do not, and draw their own focus indication).
 */
export function focusRing(state: PressableStateCallbackType) {
  return (state as PressableStateCallbackType & { focused?: boolean }).focused ? styles.ring : null;
}

const styles = StyleSheet.create({
  ring: { outlineColor: colors.focus, outlineStyle: 'solid', outlineWidth: 3, outlineOffset: 2 },
});
