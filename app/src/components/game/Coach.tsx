import { StyleSheet, Text } from 'react-native';

import type { Tip } from '@/game/coach';
import { t } from '@/i18n';
import { colors, type } from '@/theme';

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
  label: { ...type.caption, fontWeight: '700', color: colors.accent },
  title: { ...type.body, fontWeight: '700', color: colors.text },
  text: { ...type.small, color: colors.text },
});
