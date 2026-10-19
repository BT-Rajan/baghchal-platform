import { useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  boardWood: string;
  boardLine: string;
  tiger: string;
  goat: string;
  highlight: string;
  lastMove: string;
}

const light: Palette = {
  background: '#f6f3ee',
  surface: '#ffffff',
  border: '#ddd6cb',
  text: '#1f1b16',
  muted: '#6b6257',
  accent: '#b4541a',
  accentText: '#ffffff',
  danger: '#b3261e',
  success: '#2e7d32',
  boardWood: '#e8c99a',
  boardLine: '#6b4a2b',
  tiger: '#d9822b',
  goat: '#fafafa',
  highlight: '#2e7dd7',
  lastMove: 'rgba(255, 196, 0, 0.45)',
};

const dark: Palette = {
  background: '#15130f',
  surface: '#221f1a',
  border: '#3a352d',
  text: '#f1ece4',
  muted: '#a79d90',
  accent: '#e07a3b',
  accentText: '#15130f',
  danger: '#f2b8b5',
  success: '#81c784',
  boardWood: '#8a6a43',
  boardLine: '#2a1d10',
  tiger: '#e8913b',
  goat: '#f5f5f5',
  highlight: '#7ab4ff',
  lastMove: 'rgba(255, 196, 0, 0.35)',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
export const MAX_CONTENT_WIDTH = 1100;
