import { colorScheme, type ColorScheme } from '@/theme';

import { onPage, type BarStyle } from './statusBar';

/**
 * Android's navigation buttons, over the bottom of the page (or the tab bar): light on the dark
 * welcome page and after dark, dark on the light pages.
 */
export function navigationBarStyle(route: string, scheme: ColorScheme = colorScheme): BarStyle {
  return route === 'welcome' ? 'light' : onPage(scheme);
}
