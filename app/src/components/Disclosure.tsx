import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isRTL } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { focusRing } from './focus';
import { Icon } from './Icon';
import { pressedLook, ripple } from './press';

/**
 * A titled part of a long page, shut until asked for: the page shows its headings and the
 * reader opens the ones they want.
 */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.box}>
      {/* A heading holding a button, as the accessible disclosure pattern has it. */}
      <View role="heading">
        <Pressable
          role="button"
          aria-expanded={open}
          aria-label={title}
          onPress={() => setOpen(!open)}
          {...ripple()}
          style={(state) => [
            styles.row,
            pressedLook(state.pressed, styles.pressed),
            focusRing(state),
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          {/* Open, the chevron turns to point down (it starts mirrored in right-to-left). */}
          <View style={open && (isRTL() ? styles.turnedBack : styles.turned)}>
            <Icon name="chevron" color={colors.muted} size={20} />
          </View>
        </Pressable>
      </View>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.7 },
  title: { ...type.heading, color: colors.text, flex: 1 },
  turned: { transform: [{ rotate: '90deg' }] },
  turnedBack: { transform: [{ rotate: '-90deg' }] },
  body: { gap: spacing.md, paddingBottom: spacing.md },
});
