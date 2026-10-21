import { Appearance, Platform } from 'react-native';

import { isRTL } from '@/i18n';

/** The phone's (or the browser's) light or dark setting, read once when the app starts. */
export type ColorScheme = 'light' | 'dark';

/**
 * The scheme the app is drawn in. Styles are made when the app loads, so a change in the
 * phone's setting shows the next time the app starts. The web reads the browser's
 * `prefers-color-scheme` the same way, once at load.
 */
export function systemColorScheme(): ColorScheme {
  if (Platform.OS === 'web') {
    const query =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    return query?.matches ? 'dark' : 'light';
  }
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

/**
 * The visual system. Colours have one job each: `accent` is the main action on a screen (and
 * only that), `ink` marks what is selected or current, `link` is for links, and success,
 * danger and info carry their meaning. Contrast checked in both schemes (tests/theme.test.ts):
 * text ≥ 4.5:1 on its background, UI parts and pieces ≥ 3:1.
 */
const light = {
  background: '#f6f1e7',
  surface: '#ffffff',
  /** A quiet fill: segmented controls, chips, the goats' tray. */
  subtle: '#ece4d6',
  text: '#1f1a14',
  muted: '#6b6257',
  /** The main action. */
  accent: '#a64a22',
  accentText: '#ffffff',
  /** A tint of the accent, behind what is highlighted (the player to move). */
  accentSurface: '#f8e6da',
  /** What is selected or current: a chosen option, the running clock. */
  ink: '#2a1608',
  inkText: '#fff3df',
  link: '#1f5f8b',
  border: '#d9cfbf',
  danger: '#b3261e',
  dangerSurface: '#fbe9e7',
  success: '#2e6b34',
  successSurface: '#e6f2e6',
  online: '#2e8b3d',
  offline: '#857b70',
  /** The board is carved wood (components/game/Wood.tsx). */
  board: '#d4a062',
  boardLine: '#4a2a0e',
  woodLight: '#f2d29e',
  woodDark: '#b97d3e',
  woodGrain: '#6b3f17',
  woodFrame: '#7a4a1c',
  /** Pieces are raised coins (components/game/Coin.tsx): a domed face, a dark edge, an emblem. */
  tiger: '#e07a22',
  tigerLight: '#ffc46b',
  tigerDark: '#8c3a0b',
  tigerEdge: '#4f1f06',
  tigerBevel: '#ffe2a8',
  tigerStripe: '#3b1606',
  goat: '#f1e9d8',
  goatShade: '#b8a98a',
  goatEdge: '#6f6252',
  goatInk: '#5a4b3a',
  /** A coin's shadow on the board and the shine on its face. */
  pieceShadow: '#000000',
  pieceShine: '#ffffff',
  /** Where a piece can go: cream dots with an ink ring read on every board. */
  highlight: '#fff3df',
  highlightRing: '#2a1608',
  lastMove: 'rgba(255, 196, 107, 0.45)',
  /** ClawPlay brand (components/brand/Logo.tsx). */
  brand: '#e2711d',
  brandLight: '#ffb347',
  brandDark: '#a8400c',
  /** "Play" in the wordmark on light backgrounds: 4.6:1 on the page background. */
  brandDeep: '#b44d17',
  brandInk: '#2a1608',
  brandCream: '#fff3df',
  /** The leaderboard's top three, the same in both schemes, each with a number that reads on it. */
  gold: '#b8860b',
  silver: '#8a939c',
  bronze: '#a0612c',
  goldText: '#1f1a14',
  silverText: '#1f1a14',
  bronzeText: '#ffffff',
  /** Over the board at the end of a game (components/game/Victory.tsx): a dark veil, a darker
   * plate behind the words, and the words on it (the headline warm when celebrating). */
  overlay: 'rgba(31, 18, 6, 0.62)',
  overlayPlate: 'rgba(31, 18, 6, 0.55)',
  overlayText: '#ffffff',
  overlayMuted: 'rgba(255, 255, 255, 0.75)',
  overlayHeadline: '#ffe2a8',
  overlayHeadlineQuiet: '#f1e9d8',
  overlayShadow: 'rgba(0, 0, 0, 0.6)',
  /** Behind a dialog, dimming the screen under it. */
  scrim: 'rgba(31, 26, 20, 0.45)',
  /** Keyboard focus ring (web). */
  focus: '#1f5fbf',
  /** Android's touch ripple, on light surfaces and on dark or coloured ones. */
  ripple: 'rgba(42, 22, 8, 0.12)',
  rippleOnDark: 'rgba(255, 243, 223, 0.28)',
  /** The current place in a dark bar (the web's top bar). */
  currentOnDark: 'rgba(255, 243, 223, 0.14)',
};

export type Palette = { readonly [K in keyof typeof light]: string };

/**
 * The same roles after dark: brown-black pages with cream text, and the accent, links and
 * meanings lightened to read on them. What is selected turns cream with dark letters. The
 * brand's bars stay dark, and the board and its pieces stay the wood and coins they are.
 */
const dark: Palette = {
  ...light,
  background: '#17120e',
  surface: '#231c16',
  subtle: '#2f271f',
  text: '#f3eadb',
  muted: '#b5a998',
  accent: '#ee8a5a',
  accentText: '#1f1208',
  accentSurface: '#3d2618',
  ink: '#f3e2c4',
  inkText: '#2a1608',
  link: '#8cc0ea',
  border: '#433a30',
  danger: '#f28b80',
  dangerSurface: '#3d1d1a',
  success: '#80c787',
  successSurface: '#1d3221',
  online: '#55bb63',
  offline: '#91877a',
  /** "Play" in the wordmark, on the dark page. */
  brandDeep: '#f59a4a',
  scrim: 'rgba(0, 0, 0, 0.6)',
  focus: '#8ab4ff',
  ripple: 'rgba(255, 243, 223, 0.16)',
};

/** Both schemes' colours, by scheme (for tests and checks; screens use `colors`). */
export const palettes: { readonly light: Palette; readonly dark: Palette } = { light, dark };

/** The scheme the app was started in. */
export const colorScheme: ColorScheme = systemColorScheme();

export const colors: Palette = palettes[colorScheme];

/**
 * Tighter letters for big headings, where the font is drawn for it (iOS, the web); Android's
 * Roboto already sits tight, and pulling it closer runs the letters together. Arabic's letters
 * join, so they are never spaced (`spaced`).
 */
export function tight(letterSpacing: number): number {
  return Platform.OS === 'android' ? 0 : spaced(letterSpacing);
}

/** A letter spacing, or none in a joined script (Arabic), where spacing breaks the letters apart. */
export function spaced(letterSpacing: number): number {
  return isRTL() ? 0 : letterSpacing;
}

/**
 * For a heading whose style was made when the app loaded (`type.display`, `type.title`), before
 * the language was known: added where it is drawn, it takes the spacing out in Arabic.
 */
export function joinedLetters(): { letterSpacing: number } | null {
  return isRTL() ? { letterSpacing: 0 } : null;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** `board`: the board's corners (and what is laid over it); `dialog`: the apps' own dialogs. */
export const radius = { sm: 6, md: 10, lg: 16, board: 12, dialog: 28, pill: 999 } as const;

/** The big headings' weight: extra bold, but bold on Android, whose headlines are never Black. */
function headlineWeight(): '700' | '800' {
  return Platform.OS === 'android' ? '700' : '800';
}

/**
 * The type scale: each step is clearly bigger or bolder than the next, so a screen reads at a
 * glance (title, section, body, label, caption).
 */
export const type = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: headlineWeight(),
    letterSpacing: tight(-0.5),
  },
  title: { fontSize: 26, lineHeight: 32, fontWeight: headlineWeight(), letterSpacing: tight(-0.3) },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  /** Text beside the main text: notices, hints, list rows. */
  small: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  /** Android's button, dialog-answer and navigation text: medium weight, as its own are. */
  action: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Android's navigation bar labels. */
  nav: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** A count on a badge. */
  badge: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  /** The title in an Android app bar (Material's title-large). */
  appBar: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  /** A game clock: big, steady digits. */
  clock: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
} as const;

/** The confetti when I win a game: festive, in the pieces' and the brand's colours. */
export const confetti = ['#f6c344', '#e07a22', '#2f7d6d', '#ffffff', '#c0392b', '#7fb3e0'] as const;

/** A soft lift for cards and the board, instead of hard borders. */
export const shadow = {
  boxShadow:
    colorScheme === 'dark'
      ? '0px 1px 2px rgba(0, 0, 0, 0.35), 0px 4px 14px rgba(0, 0, 0, 0.4)'
      : '0px 1px 2px rgba(42, 22, 8, 0.06), 0px 4px 14px rgba(42, 22, 8, 0.07)',
} as const;
