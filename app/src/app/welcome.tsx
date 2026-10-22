import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import { peekReturn } from '@/auth/returnTo';
import { Brand } from '@/components/brand/Logo';
import { Button } from '@/components/Button';
import { BoardPreview } from '@/components/game/BoardPreview';
import { Coin } from '@/components/game/Coin';
import { AgreementLine } from '@/components/AgreementLine';
import { ErrorNotice } from '@/components/ErrorNotice';
import { focusRing } from '@/components/focus';
import { GoogleButton } from '@/components/GoogleButton';
import { Notice } from '@/components/Notice';
import { pressedLook, ripple } from '@/components/press';
import { SiteFooter } from '@/components/site/SiteFooter';
import { TextLink } from '@/components/TextLink';
import { useStartAsGuest } from '@/components/useStartAsGuest';
import type { Piece } from '@/game/bfen';
import { mark, t } from '@/i18n';
import { colors, joinedLetters, radius, shadow, spacing, type } from '@/theme';

/** Wide enough to put the board beside the words. */
const WIDE = 880;

const STEPS: readonly { piece: Piece; title: string; text: string }[] = [
  {
    piece: 'goat',
    title: mark('20 goats, 4 tigers'),
    text: mark('Tigers start in the corners; goats come in one by one.'),
  },
  {
    piece: 'tiger',
    title: mark('Tigers hunt'),
    text: mark('A tiger jumps a goat to capture it. Five wins.'),
  },
  {
    piece: 'goat',
    title: mark('Goats trap'),
    text: mark('Leave no tiger a move, and the goats win.'),
  },
];

const FEATURES: readonly { title: string; text: string }[] = [
  {
    title: mark('Live games'),
    text: mark('Play people online, rated or casual.'),
  },
  { title: mark('The computer'), text: mark('Three levels, gentle to fierce.') },
  {
    title: mark('Friends'),
    text: mark('Send a link, or run a tournament.'),
  },
  {
    title: mark('Get better'),
    text: mark('Game reviews and daily puzzles.'),
  },
];

/**
 * The front door. The web has a landing page (a first game without signing up); the phone apps
 * open on a start screen, as apps do.
 */
export default function Welcome() {
  return Platform.OS === 'web' ? <LandingPage /> : <StartScreen />;
}

/**
 * The apps' first screen, for a device nobody has signed in on yet (one that has goes straight
 * to sign-in, see the route guards in _layout): two big ways to make an account, and small ones
 * to sign in or play as a guest. It scrolls where it does not fit (large text).
 */
function StartScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.start}>
        <Brand size={36} onDark />
        <View style={styles.startBoard} aria-hidden>
          <BoardPreview theme="wood" pieces="classic" />
        </View>
        <Text role="heading" style={[styles.startHeadline, joinedLetters()]}>
          {t('Tigers hunt.\nGoats trap.')}
        </Text>
        <View style={styles.actions}>
          <GoingOn />
          <Button
            title={t('Sign up')}
            variant="bright"
            large
            onPress={() => router.push('/sign-up')}
          />
          <GoogleButton title={t('Sign up with Google')} onDark />
          <View style={styles.links}>
            <TextLink href="/sign-in" onDark>
              {t('I have an account')}
            </TextLink>
            <TextLink href="/start" onDark>
              {t('Play as a guest')}
            </TextLink>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Someone sent here from a friend's link: they get there once they are in. */
function GoingOn() {
  if (peekReturn() === null) return null;
  return <Notice tone="info">{t('Get in, and your link opens.')}</Notice>;
}

/**
 * A short game the landing page's board plays by itself, again and again: the goats come in,
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

/** The landing page's board, playing the short game on its own (still, if motion is reduced). */
function DemoBoard() {
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

/** Pick a side and play: one tap starts a first game against the Easy computer. */
function SideChoice({
  piece,
  title,
  text,
  main,
  busy,
  onPress,
}: {
  piece: Piece;
  title: string;
  text: string;
  main: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      role="button"
      aria-label={title}
      aria-busy={busy}
      disabled={busy}
      onPress={onPress}
      {...ripple(main)}
      style={(state) => [
        styles.side,
        main && styles.sideMain,
        pressedLook(state.pressed, styles.sidePressed),
        busy && styles.sideBusy,
        focusRing(state),
      ]}
    >
      <View style={styles.sideCoin} aria-hidden>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Coin piece={piece} />
        </Svg>
      </View>
      <View style={styles.cardWords}>
        <Text style={[styles.sideTitle, main && styles.sideTitleMain]}>{title}</Text>
        <Text style={[styles.sideText, main && styles.sideTextMain]}>{text}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The web's front page: the game playing itself, a side to pick and play at once (accepting
 * the terms by playing, as the line under the choice says), the rules in three steps, what
 * there is to do, and one more way in at the bottom.
 */
function LandingPage() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { agreement, play, start, waiting } = useStartAsGuest();
  const choosing = play.isPending ? play.variables : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <View style={[styles.inner, wide && styles.row]}>
            <View style={[styles.pitch, wide && styles.half]}>
              <Text role="heading" style={[styles.headline, joinedLetters()]}>
                {t('Tigers hunt.\nGoats trap.')}
              </Text>
              <Text style={styles.lede}>
                {t('Bagh Chal: four tigers against twenty goats. Pick a side.')}
              </Text>
              <GoingOn />
              <View style={styles.choice}>
                <Text style={styles.choiceTitle}>{t('Pick your side and play')}</Text>
                <View style={[styles.sides, wide && styles.sidesWide]}>
                  <SideChoice
                    piece="goat"
                    title={t('Play the goats')}
                    text={t('Trap the tigers. Goats move first.')}
                    main
                    busy={choosing === 'goat' || (waiting && choosing === null)}
                    onPress={() => start('goat')}
                  />
                  <SideChoice
                    piece="tiger"
                    title={t('Play the tigers')}
                    text={t('Capture five goats to win.')}
                    main={false}
                    busy={choosing === 'tiger' || (waiting && choosing === null)}
                    onPress={() => start('tiger')}
                  />
                </View>
                <ErrorNotice error={play.error} />
                <AgreementLine agreement={agreement} />
              </View>
              <Text style={styles.small}>{t('No sign-up: play the computer, with tips.')}</Text>
            </View>
            <View style={[styles.boardBox, wide && styles.half]}>
              <DemoBoard />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.inner}>
            <Text role="heading" style={styles.sectionTitle}>
              {t('Learn it in 30 seconds')}
            </Text>
            <View style={[styles.cards, styles.wrap]}>
              {STEPS.map((step) => (
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
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.sectionTinted]}>
          <View style={styles.inner}>
            <Text role="heading" style={styles.sectionTitle}>
              {t('Play your way')}
            </Text>
            <View style={[styles.cards, styles.wrap]}>
              {FEATURES.map((f) => (
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

        <View style={styles.hero}>
          <View style={[styles.inner, styles.closing]}>
            <Text role="heading" style={[styles.closingTitle, joinedLetters()]}>
              {t('The tigers are waiting.')}
            </Text>
            <Button
              title={t('Play now')}
              variant="bright"
              busy={choosing === 'goat'}
              onPress={() => start('goat')}
            />
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
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  startBoard: { width: '100%', maxWidth: 280, aspectRatio: 1, alignSelf: 'center', flexShrink: 1 },
  startHeadline: { ...type.display, color: colors.brandCream },
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
  // The page's headline: the largest step of the type scale.
  headline: { ...type.display, color: colors.brandCream, marginTop: spacing.md },
  lede: { ...type.body, color: colors.brandCream, opacity: 0.85, maxWidth: 520 },
  actions: { gap: spacing.sm },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  small: { ...type.caption, color: colors.brandCream, opacity: 0.75 },
  boardBox: { alignItems: 'center' },
  board: { width: '100%', maxWidth: 440, aspectRatio: 1 },
  demo: { width: '100%', maxWidth: 440, alignItems: 'center', gap: spacing.sm },
  caption: { ...type.small, color: colors.brandCream, textAlign: 'center', minHeight: 44 },
  choice: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow,
  },
  choiceTitle: { ...type.heading, color: colors.text },
  sides: { gap: spacing.sm },
  sidesWide: { flexDirection: 'row' },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtle,
  },
  sideMain: { backgroundColor: colors.accent, borderColor: colors.accent },
  sidePressed: { opacity: 0.85 },
  sideBusy: { opacity: 0.6 },
  sideCoin: { width: 52, height: 52 },
  sideTitle: { ...type.heading, color: colors.text },
  sideTitleMain: { color: colors.accentText },
  sideText: { ...type.caption, color: colors.muted },
  sideTextMain: { color: colors.accentText },
  sectionTitle: { ...type.title, color: colors.text },
  sectionTinted: { backgroundColor: colors.subtle },
  closing: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  closingTitle: { ...type.title, color: colors.brandCream, textAlign: 'center' },
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
  cardTitle: { ...type.heading, color: colors.text },
  cardText: { ...type.small, color: colors.muted },
});
