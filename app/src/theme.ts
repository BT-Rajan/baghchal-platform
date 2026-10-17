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
  board: '#e8cf9f',
  boardLine: '#7a5a30',
  tiger: '#b44d17',
  tigerStripe: '#3b1d0c',
  goat: '#fbf8ef',
  goatEdge: '#6f6252',
  highlight: '#2f7d6d',
  lastMove: 'rgba(47, 125, 109, 0.22)',
  /** Keyboard focus ring (web). */
  focus: '#1f5fbf',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 6, md: 10 } as const;
