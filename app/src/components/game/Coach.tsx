import { StyleSheet, Text } from 'react-native';

import type { Tip } from '@/game/coach';
import { t } from '@/i18n';
import { colors } from '@/theme';

import { Card } from '../Card';

/** The coach's tip for this moment of a game against the Easy computer. */
export function Coach({ tip }: { tip: Tip }) {
  return (
    <Card>
      <Text style={styles.label}>{t('Tip')}</Text>
      <Text style={styles.title} aria-live="polite">
        {tip.title}
      </Text>
      <Text style={styles.text}>{tip.text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: colors.accent, textTransform: 'uppercase' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  text: { fontSize: 15, lineHeight: 22, color: colors.text },
});
