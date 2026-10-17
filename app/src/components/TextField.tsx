import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        aria-label={label}
        aria-invalid={error !== undefined}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          error !== undefined && styles.inputError,
          focused && styles.inputFocused,
        ]}
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
  error: { fontSize: 14, color: colors.danger },
});
