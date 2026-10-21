/**
 * The status bar's icons in the apps: light over the dark brand bars (the tabs' header, the
 * screens' app bar and the start screen), dark over the light pages that have no bar.
 */
const LIGHT_PAGES = [
  /^\/sign-in/,
  /^\/sign-up/,
  /^\/start/,
  /^\/forgot-password/,
  /^\/agree/,
  /^\/verify-email/,
  /^\/reset-password/,
  /^\/confirm-email/,
  /^\/challenge\//,
  /^\/report\//,
  /^\/invite/,
];

export function statusBarStyle(pathname: string): 'light' | 'dark' {
  return LIGHT_PAGES.some((page) => page.test(pathname)) ? 'dark' : 'light';
}
