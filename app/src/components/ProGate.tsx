import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';

/** What a Pro extra does, for players without it, and the way to the plans. */
export function ProGate({ children }: { children: string }) {
  return (
    <Card>
      <Text style={styles.text}>{children}</Text>
      <Button title="See plans" variant="secondary" onPress={() => router.push('/plans')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, color: colors.text },
});
