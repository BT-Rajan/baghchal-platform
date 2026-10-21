import type { Platform } from 'react-native';

import { palettes, type Palette } from '@/theme';

type Theme = typeof import('@/theme');

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The theme as it loads with the platform and the system's scheme given. */
function loadTheme(os: typeof Platform.OS, scheme: 'light' | 'dark' | null): Theme {
  let theme: Theme | undefined;
  jest.isolateModules(() => {
    // The isolated theme loads its own react-native, so that is the one to set.
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    jest.replaceProperty(rn.Platform, 'OS', os);
    jest.spyOn(rn.Appearance, 'getColorScheme').mockReturnValue(scheme);
    theme = jest.requireActual<Theme>('@/theme');
  });
  return theme!;
}

afterEach(() => {
  jest.restoreAllMocks();
});

const TEXT_PAIRS: [keyof Palette, keyof Palette][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['accent', 'surface'],
  ['danger', 'surface'],
  ['success', 'surface'],
  ['link', 'surface'],
  ['accentText', 'accent'],
  ['inkText', 'ink'],
  ['text', 'accentSurface'],
  ['danger', 'dangerSurface'],
  ['success', 'successSurface'],
  ['brandDeep', 'background'],
  ['brandCream', 'brandInk'],
  ['goldText', 'gold'],
  ['silverText', 'silver'],
  ['bronzeText', 'bronze'],
];

describe.each(['light', 'dark'] as const)('the %s palette', (scheme) => {
  const palette = palettes[scheme];

  it.each(TEXT_PAIRS)('%s on %s reads at 4.5:1 or more', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('has every role the other scheme has', () => {
    expect(Object.keys(palette).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});

describe('the dark palette', () => {
  it('darkens the pages and keeps the brand bars, the board and the pieces', () => {
    const { light, dark } = palettes;
    expect(luminance(dark.background)).toBeLessThan(0.02);
    expect(luminance(dark.text)).toBeGreaterThan(0.7);
    for (const role of ['brandInk', 'brandCream', 'board', 'boardLine', 'tiger', 'goat'] as const) {
      expect(dark[role]).toBe(light[role]);
    }
  });
});

describe('the scheme the app starts in', () => {
  it('follows the phone', () => {
    expect(loadTheme('android', 'dark').colors).toEqual(palettes.dark);
    expect(loadTheme('ios', 'light').colors).toEqual(palettes.light);
    expect(loadTheme('android', null).colorScheme).toBe('light');
  });

  it("follows the browser's prefers-color-scheme on the web", () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
    }));
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true });
    try {
      expect(loadTheme('web', 'light').colorScheme).toBe('dark');
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
    expect(loadTheme('web', 'dark').colorScheme).toBe('light');
  });

  it('gives the cards a deeper shadow after dark', () => {
    expect(loadTheme('android', 'dark').shadow.boxShadow).toContain('rgba(0, 0, 0');
    expect(loadTheme('android', 'light').shadow.boxShadow).toContain('rgba(42, 22, 8');
  });
});

describe('headline weights', () => {
  it('are bold at most on Android, extra bold elsewhere', () => {
    const android = loadTheme('android', 'light').type;
    expect(android.title.fontWeight).toBe('700');
    expect(android.display.fontWeight).toBe('700');
    const ios = loadTheme('ios', 'light').type;
    expect(ios.title.fontWeight).toBe('800');
    expect(ios.display.fontWeight).toBe('800');
  });
});
