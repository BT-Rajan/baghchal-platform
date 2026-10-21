import { useId, useState, type Ref } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  /** The input itself, to focus it (the next field of a form). */
  ref?: Ref<TextInputInstance>;
}

export function TextField({ label, error, ref, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const android = Platform.OS === 'android';
  const errorId = useId();
  const invalid = error !== undefined;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, android && focused && styles.labelFocused]}>{label}</Text>
      <TextInput
        ref={ref}
        aria-label={label}
        aria-invalid={invalid}
        // The error is read with the field: described by it on the web, its hint in the apps.
        {...(invalid &&
          (Platform.OS === 'web' ? { 'aria-describedby': errorId } : { accessibilityHint: error }))}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          android && styles.android,
          input.multiline === true && styles.multiline,
          invalid && styles.inputError,
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
      {invalid && (
        <Text id={errorId} role="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { ...type.label, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: type.body.fontSize,
    color: colors.text,
  },
  // Room for a few lines, written from the top.
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  // A thicker border in the focus colour (React Native Web removes the browser's outline).
  inputFocused: { borderColor: colors.focus, borderWidth: 2, margin: -1 },
  // Android: its outlined field, 56 tall with small corners, focused in the brand's colour.
  android: { minHeight: 56, borderRadius: 4, borderColor: colors.muted },
  androidFocused: { borderColor: colors.accent, borderWidth: 2, margin: -1 },
  labelFocused: { color: colors.accent },
  error: { ...type.label, fontWeight: '400', color: colors.danger },
});
