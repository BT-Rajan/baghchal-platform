import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { peekReturn } from '@/auth/returnTo';
import { Brand } from '@/components/brand/Logo';
import { Button } from '@/components/Button';
import { BoardPreview } from '@/components/game/BoardPreview';
import { Coin } from '@/components/game/Coin';
import { Notice } from '@/components/Notice';
import { Segmented } from '@/components/Segmented';
import { SiteFooter } from '@/components/site/SiteFooter';
import type { Piece } from '@/game/bfen';
import { mark, t } from '@/i18n';
import { colors, radius, spacing, tight } from '@/theme';

/** Wide enough to put the board beside the words. */
const WIDE = 880;

const STEPS: readonly { piece: Piece; title: string; text: string }[] = [
  {
    piece: 'goat',
    title: mark('20 goats, 4 tigers'),
    text: mark('The tigers start in the corners. The goats come onto the board one at a time.'),
  },
  {
    piece: 'tiger',
    title: mark('Tigers hunt'),
    text: mark('A tiger captures by jumping over a goat. Five captures and the tigers win.'),
  },
  {
    piece: 'goat',
    title: mark('Goats trap'),
    text: mark('Hem the tigers in until none can move, and the goats win.'),
  },
];

const FEATURES: readonly { title: string; text: string }[] = [
  {
    title: mark('Live games'),
    text: mark('Quick or standard games with players online, rated or casual.'),
  },
  { title: mark('The computer'), text: mark('Three levels, from a gentle start to a real fight.') },
  {
    title: mark('Friends'),
    text: mark('Send a friend a link to a game, or run a small tournament.'),
  },
  {
    title: mark('Get better'),
    text: mark('The engine reviews your games; puzzles sharpen your openings.'),
  },
];

const TABS = [
  { value: 'rules', label: mark("How it's played") },
  { value: 'ways', label: mark('Play your way') },
] as const;

type Tab = (typeof TABS)[number]['value'];

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
            {t('Tigers hunt.\nGoats trap.')}
          </Text>
          <Text style={styles.lede}>{t('Bagh Chal, the strategy game of the Himalayas.')}</Text>
        </View>
        <View style={styles.actions}>
          <GoingOn />
          <Button
            title={t('Play now, no sign-up')}
            variant="bright"
            onPress={() => router.push('/start')}
          />
          <Button title={t('Sign in')} variant="light" onPress={() => router.push('/sign-in')} />
          <Button
            title={t('Create a free account')}
            variant="light"
            onPress={() => router.push('/sign-up')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Someone sent here from a friend's link: they get there once they are in. */
function GoingOn() {
  if (peekReturn() === null) return null;
  return (
    <Notice tone="info">
      {t('Play now as a guest, or sign in, and we will take you to the link you opened.')}
    </Notice>
  );
}

function LandingPage() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [tab, setTab] = useState<Tab>('rules');
  const play = () => router.push('/start');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <View style={[styles.inner, wide && styles.row]}>
            <View style={[styles.pitch, wide && styles.half]}>
              <Text role="heading" style={[styles.headline, wide && styles.headlineWide]}>
                {t('Tigers hunt.\nGoats trap.')}
              </Text>
              <Text style={styles.lede}>
                {t(
                  'Bagh Chal, the strategy game of the Himalayas, played live. Four tigers against twenty goats: which side will you take?',
                )}
              </Text>
              {/* Signing in and up are in the top bar; the terms and privacy in the footer. */}
              <GoingOn />
              <View style={[styles.actions, wide && styles.actionsWide]}>
                <Button title={t('Play now, no sign-up')} variant="bright" onPress={play} />
              </View>
              <Text style={styles.small}>
                {t('No account needed: make one later to keep your rating.')}
              </Text>
            </View>
            <View style={[styles.boardBox, wide && styles.half]} aria-hidden>
              <View style={[styles.board, !wide && styles.boardNarrow]}>
                <BoardPreview theme="wood" pieces="classic" />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.inner}>
            {/* One section, two tabs: the page stays about a screen long. */}
            <Segmented
              label={t('Find out more')}
              options={TABS.map((o) => ({ value: o.value, label: t(o.label) }))}
              value={tab}
              onChange={setTab}
            />
            <View style={[styles.cards, styles.wrap]}>
              {tab === 'rules'
                ? STEPS.map((step) => (
                    <View key={step.title} style={[styles.card, styles.step]}>
                      <View style={styles.coin} aria-hidden>
                        <Svg width="100%" height="100%" viewBox="0 0 100 100">
                          <Coin piece={step.piece} />
                        </Svg>
                      </View>
                      <View style={styles.cardWords}>
                        <Text style={styles.cardTitle}>{t(step.title)}</Text>
                        <Text style={styles.cardText}>{t(step.text)}</Text>
                      </View>
                    </View>
                  ))
                : FEATURES.map((f) => (
                    <View key={f.title} style={[styles.card, styles.feature]}>
                      <View style={styles.cardWords}>
                        <Text style={styles.cardTitle}>{t(f.title)}</Text>
                        <Text style={styles.cardText}>{t(f.text)}</Text>
                      </View>
                    </View>
                  ))}
            </View>
          </View>
        </View>
        <SiteFooter />
      </ScrollView>
    </SafeAreaView>
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
    letterSpacing: tight(-0.5),
  },
  page: { flexGrow: 1, backgroundColor: colors.background },
  inner: { width: '100%', maxWidth: 1100, alignSelf: 'center', gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center' },
  half: { flex: 1 },
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
    letterSpacing: tight(-1),
    marginTop: spacing.md,
  },
  headlineWide: { fontSize: 64, lineHeight: 70 },
  lede: { fontSize: 18, lineHeight: 27, color: colors.brandCream, opacity: 0.85, maxWidth: 520 },
  actions: { gap: spacing.sm },
  actionsWide: { flexDirection: 'row', flexWrap: 'wrap' },
  small: { fontSize: 14, color: colors.brandCream, opacity: 0.75 },
  boardBox: { alignItems: 'center' },
  board: { width: '100%', maxWidth: 440, aspectRatio: 1 },
  boardNarrow: { maxWidth: 280 },
  section: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  cards: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  step: { flexGrow: 1, flexBasis: 300 },
  feature: { flexGrow: 1, flexBasis: 240 },
  cardWords: { flex: 1, gap: spacing.xs },
  coin: { width: 44, height: 44 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardText: { fontSize: 15, lineHeight: 22, color: colors.muted },
});
