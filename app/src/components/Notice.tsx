import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

const tones = {
  error: { backgroundColor: colors.dangerSurface, color: colors.danger },
  success: { backgroundColor: colors.successSurface, color: colors.success },
  info: { backgroundColor: colors.subtle, color: colors.text },
} as const;

export function Notice({ tone, children }: { tone: keyof typeof tones; children: string }) {
  const { backgroundColor, color } = tones[tone];
  return (
    <View style={[styles.box, { backgroundColor }]}>
      <Text role={tone === 'error' ? 'alert' : 'status'} style={[styles.text, { color }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: spacing.md },
  text: { ...type.small },
});
