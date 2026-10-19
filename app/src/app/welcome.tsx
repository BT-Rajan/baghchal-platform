import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { Brand } from '@/components/brand/Logo';
import { Button } from '@/components/Button';
import { BoardPreview } from '@/components/game/BoardPreview';
import { Coin } from '@/components/game/Coin';
import type { Piece } from '@/game/bfen';
import { colors, radius, spacing } from '@/theme';

/** Wide enough to put the board beside the words. */
const WIDE = 880;

const STEPS: readonly { piece: Piece; title: string; text: string }[] = [
  {
    piece: 'goat',
    title: '20 goats, 4 tigers',
    text: 'The tigers start in the corners. The goats come onto the board one at a time.',
  },
  {
    piece: 'tiger',
    title: 'Tigers hunt',
    text: 'A tiger captures by jumping over a goat. Five captures and the tigers win.',
  },
  {
    piece: 'goat',
    title: 'Goats trap',
    text: 'Hem the tigers in until none can move, and the goats win.',
  },
];

const FEATURES: readonly { title: string; text: string }[] = [
  { title: 'Live games', text: 'Quick or standard games with players online, rated or casual.' },
  { title: 'The computer', text: 'Three levels, from a gentle start to a real fight.' },
  { title: 'Friends', text: 'Send a friend a link to a game, or run a small tournament.' },
  { title: 'Get better', text: 'The engine reviews your games; puzzles sharpen your openings.' },
];

/**
 * The front door: what ClawPlay is, and a first game without signing up (`/start`). The web
 * has a landing page; the phone apps open on a start screen, as apps do.
 */
export default function Welcome() {
  return Platform.OS === 'web' ? <LandingPage /> : <StartScreen />;
}

/** The apps' first screen: the board, and the ways in. Nothing to scroll. */
function StartScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.start}>
        <Brand size={36} onDark />
        <View style={styles.startBoard} aria-hidden>
          <BoardPreview theme="wood" pieces="classic" />
        </View>
        <View style={styles.startWords}>
          <Text role="heading" style={styles.startHeadline}>
            Tigers hunt.{'\n'}Goats trap.
          </Text>
          <Text style={styles.lede}>Bagh Chal, the strategy game of the Himalayas.</Text>
        </View>
        <View style={styles.actions}>
          <Button
            title="Play now, no sign-up"
            variant="bright"
            onPress={() => router.push('/start')}
          />
          <Button title="Sign in" variant="light" onPress={() => router.push('/sign-in')} />
          <Button
            title="Create a free account"
            variant="light"
            onPress={() => router.push('/sign-up')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function LandingPage() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const play = () => router.push('/start');

  const actions = (
    <View style={[styles.actions, wide && styles.actionsWide]}>
      <Button title="Play now, no sign-up" variant="bright" onPress={play} />
      <Button title="Sign in" variant="light" onPress={() => router.push('/sign-in')} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <View style={[styles.inner, wide && styles.row]}>
            <View style={[styles.pitch, wide && styles.half]}>
              <Brand size={44} onDark />
              <Text role="heading" style={[styles.headline, wide && styles.headlineWide]}>
                Tigers hunt.{'\n'}Goats trap.
              </Text>
              <Text style={styles.lede}>
                Bagh Chal, the strategy game of the Himalayas, played live. Four tigers against
                twenty goats: which side will you take?
              </Text>
              {actions}
              <Text style={styles.small}>
                New here?{' '}
                <Text role="link" style={styles.smallLink} onPress={() => router.push('/sign-up')}>
                  Create a free account
                </Text>{' '}
                to keep your rating.
              </Text>
              <Text style={styles.small}>
                <Text role="link" style={styles.smallLink} onPress={() => router.push('/terms')}>
                  Terms of service
                </Text>
                {'  ·  '}
                <Text role="link" style={styles.smallLink} onPress={() => router.push('/privacy')}>
                  Privacy policy
                </Text>
              </Text>
            </View>
            <View style={[styles.boardBox, wide && styles.half]} aria-hidden>
              <View style={styles.board}>
                <BoardPreview theme="wood" pieces="classic" />
              </View>
            </View>
          </View>
        </View>

        <Section title="How it's played">
          <View style={[styles.cards, wide && styles.row]}>
            {STEPS.map((step) => (
              <View key={step.title} style={[styles.card, wide && styles.third]}>
                <View style={styles.coin} aria-hidden>
                  <Svg width="100%" height="100%" viewBox="0 0 100 100">
                    <Coin piece={step.piece} />
                  </Svg>
                </View>
                <Text style={styles.cardTitle}>{step.title}</Text>
                <Text style={styles.cardText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Play your way">
          <View style={[styles.cards, styles.wrap]}>
            {FEATURES.map((f) => (
              <View key={f.title} style={[styles.card, styles.feature]}>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.cardText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </Section>

        <View style={styles.closing}>
          <View style={styles.inner}>
            <Text role="heading" style={styles.closingTitle}>
              Your first game is a moment away.
            </Text>
            <View style={wide ? styles.actionsWide : styles.actions}>
              <Button title="Start playing" variant="bright" onPress={play} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.inner}>
        <Text role="heading" style={styles.sectionTitle}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandInk },
  start: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  startBoard: { width: '100%', maxWidth: 360, aspectRatio: 1, alignSelf: 'center', flexShrink: 1 },
  startWords: { gap: spacing.sm },
  startHeadline: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    color: colors.brandCream,
    letterSpacing: -0.5,
  },
  page: { flexGrow: 1, backgroundColor: colors.background },
  inner: { width: '100%', maxWidth: 1100, alignSelf: 'center', gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center' },
  half: { flex: 1 },
  third: { flex: 1 },
  hero: {
    backgroundColor: colors.brandInk,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  pitch: { gap: spacing.md },
  headline: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
    color: colors.brandCream,
    letterSpacing: -1,
    marginTop: spacing.md,
  },
  headlineWide: { fontSize: 64, lineHeight: 70 },
  lede: { fontSize: 18, lineHeight: 27, color: colors.brandCream, opacity: 0.85, maxWidth: 520 },
  actions: { gap: spacing.sm },
  actionsWide: { flexDirection: 'row', flexWrap: 'wrap' },
  small: { fontSize: 14, color: colors.brandCream, opacity: 0.75 },
  smallLink: { color: colors.brandLight, fontWeight: '700', textDecorationLine: 'underline' },
  boardBox: { alignItems: 'center' },
  board: { width: '100%', maxWidth: 440, aspectRatio: 1 },
  section: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  sectionTitle: { fontSize: 28, fontWeight: '800', color: colors.text },
  cards: { gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  feature: { flexGrow: 1, flexBasis: 240 },
  coin: { width: 56, height: 56 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardText: { fontSize: 15, lineHeight: 22, color: colors.muted },
  closing: {
    backgroundColor: colors.brandInk,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  closingTitle: { fontSize: 26, fontWeight: '800', color: colors.brandCream },
});
