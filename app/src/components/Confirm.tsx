import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { colors, radius, shadow, spacing, type } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';
import { pressedLook, ripple } from './press';

interface ConfirmProps {
  question: string;
  confirmTitle: string;
  cancelTitle?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one way to confirm an action that is hard to undo: the question, said plainly, and the
 * two answers. Shown in place of the button that asked; in the apps, as their own dialog over
 * the screen (the back button, or a tap outside, cancels).
 */
export function Confirm(props: ConfirmProps) {
  return Platform.OS === 'web' ? <InPlace {...props} /> : <Dialog {...props} />;
}

function InPlace({
  question,
  confirmTitle,
  cancelTitle = t('Cancel'),
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
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

function Dialog({
  question,
  confirmTitle,
  cancelTitle = t('Cancel'),
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel} testID="dialog">
      {/* A tap outside cancels; screen readers use the Cancel button instead. */}
      <Pressable style={styles.scrim} onPress={onCancel} accessible={false} testID="scrim">
        {/* Taps on the dialog itself stay in it. */}
        <Pressable role="alert" style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dialogText}>{question}</Text>
          <View style={styles.actions}>
            <TextAction title={cancelTitle} onPress={onCancel} />
            <TextAction title={confirmTitle} busy={busy} onPress={onConfirm} strong />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A dialog's answer: text only, as the apps' own dialogs have. */
function TextAction({
  title,
  onPress,
  busy = false,
  strong = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  strong?: boolean;
}) {
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-busy={busy}
      aria-disabled={busy}
      disabled={busy}
      onPress={onPress}
      {...ripple()}
      style={(state) => [
        styles.action,
        pressedLook(state.pressed, styles.actionPressed),
        busy && styles.busy,
      ]}
    >
      <Text style={[styles.actionText, strong && styles.actionStrong]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  question: { ...type.body, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(31, 26, 20, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 12,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    ...shadow,
  },
  dialogText: { ...type.body, color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  action: {
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionPressed: { backgroundColor: colors.subtle },
  busy: { opacity: 0.55 },
  actionText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.accent },
  actionStrong: { fontWeight: '700' },
});
