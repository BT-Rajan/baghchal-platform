import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

export default function Home() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Bagh Chal
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: { fontSize: 32, fontWeight: '700', color: colors.text },
});
