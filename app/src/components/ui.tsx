import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import { MAX_CONTENT_WIDTH, radius, space, usePalette } from '@/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const palette = usePalette();
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['bottom', 'left', 'right']}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const palette = usePalette();
  return (
    <Text style={[styles.body, { color: muted ? palette.muted : palette.text }]}>{children}</Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const palette = usePalette();
  const inactive = disabled || busy;
  const background = { primary: palette.accent, secondary: 'transparent', danger: 'transparent' }[
    kind
  ];
  const color = { primary: palette.accentText, secondary: palette.text, danger: palette.danger }[
    kind
  ];
  const border =
    kind === 'primary' ? palette.accent : kind === 'danger' ? palette.danger : palette.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: border,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string | undefined }) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: error ? palette.danger : palette.border,
            backgroundColor: palette.surface,
          },
        ]}
        {...input}
      />
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const palette = usePalette();
  if (!error) return null;
  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>
      {describeError(error)}
    </Text>
  );
}

export function Loading() {
  const palette = usePalette();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.accent} accessibilityLabel="Loading" />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: space.lg,
    gap: space.md,
  },
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600', marginTop: space.sm },
  body: { fontSize: 15, lineHeight: 21 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  field: { gap: space.xs },
  label: { fontSize: 13, fontWeight: '500' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  error: { fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
