import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import type { Piece } from '@/game/bfen';
import { mark, t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { BoardPreview } from './BoardPreview';

/**
 * A short game the board plays by itself, again and again: the goats come in,
 * the tigers move, one tiger jumps a goat. Pieces by point (a1 bottom left); a caption each.
 */
const TIGERS = { a1: 'tiger', a5: 'tiger', e1: 'tiger', e5: 'tiger' } as const;
const DEMO: readonly { placed: Readonly<Record<string, Piece>>; caption: string }[] = [
  { placed: TIGERS, caption: mark('Four tigers wait in the corners.') },
  { placed: { ...TIGERS, c3: 'goat' }, caption: mark('The goats come in, one at a time.') },
  {
    placed: { a5: 'tiger', e1: 'tiger', e5: 'tiger', b2: 'tiger', c3: 'goat' },
    caption: mark('A tiger creeps closer.'),
  },
  {
    placed: { a5: 'tiger', e1: 'tiger', e5: 'tiger', b2: 'tiger', c3: 'goat', d2: 'goat' },
    caption: mark('The goats close ranks.'),
  },
  {
    placed: { a5: 'tiger', e1: 'tiger', d4: 'tiger', b2: 'tiger', c3: 'goat', d2: 'goat' },
    caption: mark('Another tiger prowls in.'),
  },
  {
    placed: {
      a5: 'tiger',
      e1: 'tiger',
      d4: 'tiger',
      b2: 'tiger',
      c3: 'goat',
      d2: 'goat',
      c4: 'goat',
    },
    caption: mark('A goat steps too close…'),
  },
  {
    placed: { a5: 'tiger', e1: 'tiger', b4: 'tiger', b2: 'tiger', c3: 'goat', d2: 'goat' },
    caption: mark('…and the tiger jumps it. Captured!'),
  },
  {
    placed: {
      a5: 'tiger',
      e1: 'tiger',
      b4: 'tiger',
      b2: 'tiger',
      c3: 'goat',
      d2: 'goat',
      d4: 'goat',
      c4: 'goat',
    },
    caption: mark('Four more captures and the tigers win. Can the goats trap them first?'),
  },
];
const DEMO_STEP_MS = 1800;

/**
 * The board playing a short game on its own, with a line on each step (still, if motion is
 * reduced): on the brand's dark colour, on the landing page and the web's home.
 */
export function DemoBoard() {
  const [step, setStep] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % DEMO.length), DEMO_STEP_MS);
    return () => clearInterval(timer);
  }, [still]);
  const frame = DEMO[still ? DEMO.length - 1 : step] ?? DEMO[0]!;
  return (
    <View style={styles.demo}>
      <View style={styles.board} aria-hidden>
        <BoardPreview theme="wood" pieces="classic" placed={frame.placed} />
      </View>
      <Text style={styles.caption}>{t(frame.caption)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { width: '100%', maxWidth: 440, aspectRatio: 1 },
  demo: { width: '100%', maxWidth: 440, alignItems: 'center', gap: spacing.sm },
  caption: { ...type.small, color: colors.brandCream, textAlign: 'center', minHeight: 44 },
});
