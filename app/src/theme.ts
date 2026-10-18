/** Contrast checked: text ≥ 4.5:1 on its background, UI parts and pieces ≥ 3:1. */
export const colors = {
  background: '#f6f1e7',
  surface: '#ffffff',
  text: '#1f1a14',
  muted: '#6b6257',
  accent: '#a64a22',
  accentText: '#ffffff',
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
  highlight: '#2f7d6d',
  lastMove: 'rgba(47, 125, 109, 0.22)',
  /** Keyboard focus ring (web). */
  focus: '#1f5fbf',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 6, md: 10 } as const;
