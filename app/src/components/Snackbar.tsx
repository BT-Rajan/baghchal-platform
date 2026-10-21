import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing, type } from '@/theme';

import { Notice } from './Notice';

/** How long a snackbar stays. */
export const SNACKBAR_MS = 4000;

interface Shown {
  id: number;
  text: string;
  /** Room to leave at the bottom for the tab bar of the screen that showed it. */
  above: number;
}

// The one snackbar of the app, and whether a host is there to draw it.
let shown: Shown | null = null;
let hosts = 0;
let lastId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hide(id: number) {
  if (shown?.id !== id) return;
  shown = null;
  emit();
}

/**
 * Show a short word of success in the apps' snackbar (a newer one takes the place of the last).
 * Above the tab bar when the screen showing it has one.
 */
export function useSnackbar(): (text: string) => void {
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0;
  return useCallback(
    (text: string) => {
      lastId += 1;
      shown = { id: lastId, text, above: tabBar };
      emit();
    },
    [tabBar],
  );
}

/**
 * The one way to say an action succeeded, for a moment: in place on the web (a success
 * Notice), the snackbar in the apps (shown once when this appears, or when its words change).
 * What stays true for a while (a challenge waiting, a link sent) is a Notice, not this.
 */
export function SuccessNotice({ children }: { children: string }) {
  const hosted = useSyncExternalStore(subscribe, () => hosts > 0) && Platform.OS !== 'web';
  const show = useSnackbar();
  useEffect(() => {
    if (hosted) show(children);
  }, [hosted, children, show]);
  // Without a snackbar to show it in (the web, or nothing mounted to draw it), it stays in place.
  return hosted ? null : <Notice tone="success">{children}</Notice>;
}

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shows = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hides = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setHeight(0),
    );
    return () => {
      shows.remove();
      hides.remove();
    };
  }, []);
  return height;
}

/**
 * Draws the snackbar, at the bottom of the screen, above the tab bar and the keyboard, for four
 * seconds. Mounted once, at the root, over the screens (the apps only; the web keeps its
 * notices in place).
 */
export function SnackbarHost() {
  if (Platform.OS === 'web') return null;
  return <NativeHost />;
}

function NativeHost() {
  const current = useSyncExternalStore(subscribe, () => shown);
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  useEffect(() => {
    hosts += 1;
    emit();
    return () => {
      hosts -= 1;
      emit();
    };
  }, []);
  useEffect(() => {
    if (current === null) return;
    // Android reads it out as its live region; iOS is told.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(current.text);
    const timer = setTimeout(() => hide(current.id), SNACKBAR_MS);
    return () => clearTimeout(timer);
  }, [current]);
  const bottom =
    (keyboard > 0 ? keyboard : Math.max(current?.above ?? 0, insets.bottom)) + spacing.sm;
  return (
    // Always there, so a new message is a change the screen reader reads.
    <View
      pointerEvents="box-none"
      aria-live="polite"
      style={[styles.layer, { bottom }]}
      testID="snackbar-host"
    >
      {current !== null && (
        <View style={styles.bar} testID="snackbar">
          <Text role="status" style={styles.text}>
            {current.text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    start: spacing.md,
    end: spacing.md,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 640,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
    ...shadow,
  },
  text: { ...type.small, color: colors.inkText },
});
