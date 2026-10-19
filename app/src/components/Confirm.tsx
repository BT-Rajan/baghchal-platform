import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';

/**
 * The one way to confirm an action that is hard to undo: the question, said plainly, and the
 * two answers side by side. Shown in place of the button that asked.
 */
export function Confirm({
  question,
  confirmTitle,
  cancelTitle = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmTitle: string;
  cancelTitle?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Card tone="accent">
      <Text style={styles.question}>{question}</Text>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button title={confirmTitle} busy={busy} onPress={onConfirm} />
        </View>
        <View style={styles.cell}>
          <Button title={cancelTitle} variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  question: { ...type.body, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
});
