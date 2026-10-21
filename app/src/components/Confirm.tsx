import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { colors, radius, shadow, spacing, type } from '@/theme';

import { Button } from './Button';
import { Card } from './Card';
import { ErrorNotice } from './ErrorNotice';
import { pressedLook, ripple } from './press';

interface ConfirmProps {
  question: string;
  confirmTitle: string;
  cancelTitle?: string;
  /** While the answer is being carried out: neither answer can be given again. */
  busy?: boolean;
  /** Why carrying out the answer failed, shown with the question (the one way: ErrorNotice). */
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one way to confirm an action that is hard to undo: the question, said plainly, and the
 * two answers. Shown in place of the button that asked; in the apps, as their own dialog over
 * the screen (the back button, or a tap outside, cancels, unless the answer is being carried
 * out). The screen keeps it open until the action succeeds, showing `error` if it fails.
 */
export function Confirm(props: ConfirmProps) {
  return Platform.OS === 'web' ? <InPlace {...props} /> : <Dialog {...props} />;
}

function InPlace({
  question,
  confirmTitle,
  cancelTitle = t('Cancel'),
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  // The screen's own primary button stays the only one: the answer that is hard to undo is
  // the danger style.
  return (
    <Card tone="accent">
      <Text style={styles.question}>{question}</Text>
      <ErrorNotice error={error} />
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button title={confirmTitle} variant="danger" busy={busy} onPress={onConfirm} />
        </View>
        <View style={styles.cell}>
          <Button title={cancelTitle} variant="secondary" disabled={busy} onPress={onCancel} />
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
  error,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  // While the answer is carried out, nothing dismisses the dialog.
  const cancel = () => {
    if (!busy) onCancel();
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={cancel} testID="dialog">
      {/* A tap outside cancels; screen readers use the Cancel button instead. */}
      <Pressable style={styles.scrim} onPress={cancel} accessible={false} testID="scrim">
        {/* Taps on the dialog itself stay in it. */}
        <Pressable
          role="alertdialog"
          aria-modal
          aria-label={question}
          style={styles.dialog}
          onPress={() => {}}
        >
          <Text style={styles.dialogText}>{question}</Text>
          <ErrorNotice error={error} />
          <View style={styles.actions}>
            <TextAction title={cancelTitle} disabled={busy} onPress={cancel} />
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
  disabled = false,
  strong = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  strong?: boolean;
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-busy={busy}
      aria-disabled={inactive}
      disabled={inactive}
      onPress={onPress}
      {...ripple()}
      style={(state) => [
        styles.action,
        pressedLook(state.pressed, styles.actionPressed),
        inactive && styles.busy,
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
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.dialog,
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
  actionText: { ...type.action, color: colors.accent },
  actionStrong: { fontWeight: '700' },
});
