import { colorScheme, type ColorScheme } from '@/theme';

/** Light or dark icons, as expo-status-bar and expo-navigation-bar name them. */
export type BarStyle = 'light' | 'dark';

/** The screens whose own top is the dark brand: the tabs' brand bar, the welcome page. */
const DARK_TOPS = new Set(['(tabs)', 'welcome']);

/** Icons that read on the page: light after dark, dark on the light pages. */
export function onPage(scheme: ColorScheme): BarStyle {
  return scheme === 'dark' ? 'light' : 'dark';
}

/**
 * The status bar's icons in the apps: light over the brand's bars, dark in either scheme (a
 * screen's app bar, the tabs' bar, the welcome page); over a page with no bar (the sign-in
 * forms, Page not found), whatever reads on the page.
 */
export function statusBarStyle(
  route: string,
  headerShown: boolean,
  scheme: ColorScheme = colorScheme,
): BarStyle {
  return headerShown || DARK_TOPS.has(route) ? 'light' : onPage(scheme);
}
