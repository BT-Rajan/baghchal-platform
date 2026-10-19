/**
 * The visual system. Colours have one job each: `accent` is the main action on a screen (and
 * only that), `ink` marks what is selected or current, `link` is for links, and success,
 * danger and info carry their meaning. Contrast checked: text ≥ 4.5:1 on its background, UI
 * parts and pieces ≥ 3:1.
 */
export const colors = {
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
  /** The leaderboard's top three. */
  gold: '#b8860b',
  silver: '#8a939c',
  bronze: '#a0612c',
  /** Keyboard focus ring (web). */
  focus: '#1f5fbf',
  /** Android's touch ripple, on light surfaces and on dark or coloured ones. */
  ripple: 'rgba(42, 22, 8, 0.12)',
  rippleOnDark: 'rgba(255, 243, 223, 0.28)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/**
 * The type scale: each step is clearly bigger or bolder than the next, so a screen reads at a
 * glance (title, section, body, label, caption).
 */
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

/** A soft lift for cards and the board, instead of hard borders. */
export const shadow = {
  boxShadow: '0px 1px 2px rgba(42, 22, 8, 0.06), 0px 4px 14px rgba(42, 22, 8, 0.07)',
} as const;
