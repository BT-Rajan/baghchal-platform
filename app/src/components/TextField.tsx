import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const android = Platform.OS === 'android';
  return (
    <View style={styles.field}>
      <Text style={[styles.label, android && focused && styles.labelFocused]}>{label}</Text>
      <TextInput
        aria-label={label}
        aria-invalid={error !== undefined}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          android && styles.android,
          error !== undefined && styles.inputError,
          focused && (android ? styles.androidFocused : styles.inputFocused),
        ]}
        // Android tints the cursor and selected text; ours, not the system's teal.
        {...(android && { cursorColor: colors.accent, selectionColor: colors.accentSurface })}
        {...(input.secureTextEntry && { autoCapitalize: 'none', autoCorrect: false })}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
      />
      {error !== undefined && (
        <Text role="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  // A thicker border in the focus colour (React Native Web removes the browser's outline).
  inputFocused: { borderColor: colors.focus, borderWidth: 2, margin: -1 },
  // Android: its outlined field, 56 tall with small corners, focused in the brand's colour.
  android: { minHeight: 56, borderRadius: 4, borderColor: colors.muted },
  androidFocused: { borderColor: colors.accent, borderWidth: 2, margin: -1 },
  labelFocused: { color: colors.accent },
  error: { fontSize: 14, color: colors.danger },
});
