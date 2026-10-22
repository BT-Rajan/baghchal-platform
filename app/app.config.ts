import type { ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

import { apiUrlProblem } from './src/apiUrl.js';

// No secrets belong here (the API's address, EXPO_PUBLIC_API_URL, is read in src/config.ts),
// and no Expo-cloud settings (EAS project ID, updates URL): see docs/adr/0002.
// A release build must not send passwords and tokens over plain http (see src/apiUrl.ts).
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const allowPlainHttp = process.env.EXPO_PUBLIC_ALLOW_PLAIN_HTTP === 'true';
const problem =
  apiUrl === undefined
    ? null
    : apiUrlProblem(apiUrl, process.env.NODE_ENV === 'production', allowPlainHttp);
if (problem !== null) throw new Error(problem);

/**
 * The pages a shared or emailed link opens (src/lobby/format.ts shareLink, the server's
 * emails). With these, Android opens such a link on the website's host in the app (expo-router
 * opens it by its path) once the site proves the app is its own (the server's
 * /.well-known/assetlinks.json, docs/operations.md).
 */
export const LINKED_PAGES = [
  { pathPrefix: '/c/' },
  { pathPrefix: '/tournament/' },
  { pathPrefix: '/challenge/' },
  { path: '/verify-email' },
  { path: '/reset-password' },
  { path: '/confirm-email' },
  { path: '/privacy' },
  { path: '/terms' },
];

/**
 * Android's filter for the website's links, or none. Android only verifies (and so only opens
 * without asking) https links: a website on plain http (a test server) keeps its links in the
 * browser.
 */
export function linkFilters(
  webUrl: string | undefined,
): NonNullable<NonNullable<ExpoConfig['android']>['intentFilters']> {
  if (webUrl === undefined) return [];
  let parsed: URL;
  try {
    parsed = new URL(webUrl);
  } catch {
    return [];
  }
  if (parsed.protocol !== 'https:') return [];
  const site = {
    scheme: 'https',
    host: parsed.hostname,
    ...(parsed.port !== '' && { port: parsed.port }),
  };
  return [
    {
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: LINKED_PAGES.map((page) => ({ ...site, ...page })),
    },
  ];
}

/**
 * Each build's number, which Android needs to go up for an update to install over the last one
 * (the Android test build passes its run number); 1 for builds made by hand.
 */
export function versionCode(value: string | undefined): number {
  if (value === undefined || value === '') return 1;
  const code = Number(value);
  if (!Number.isInteger(code) || code < 1) {
    throw new Error(`ANDROID_VERSION_CODE must be a whole number above 0: ${value}`);
  }
  return code;
}

/**
 * Android refuses plain http in release builds. Only a build that opted out of https (a test
 * server on a private network, see src/apiUrl.js) is allowed it; store builds never are.
 */
const withPlainHttp: ConfigPlugin = (expo) =>
  withAndroidManifest(expo, (mod) => {
    for (const application of mod.modResults.manifest.application ?? []) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });

const config: ExpoConfig = {
  name: 'ClawPlay',
  slug: 'clawplay',
  scheme: ['clawplay', 'com.clawplay.app'], // the second is Google sign-in's redirect
  description: 'Bagh Chal, the tiger-and-goat game of Nepal, played live.',
  icon: './assets/icon.png',
  version: '0.1.0',
  orientation: 'default',
  // Light or dark, as the device is set (src/theme.ts has both palettes).
  userInterfaceStyle: 'automatic',
  // The window behind the pages: the page colour, so the system's navigation bar area (and a
  // screen still drawing) match the app instead of showing white or black.
  backgroundColor: '#f6f1e7',
  ios: { supportsTablet: true, bundleIdentifier: 'com.clawplay.app' },
  android: {
    package: 'com.clawplay.app',
    versionCode: versionCode(process.env.ANDROID_VERSION_CODE),
    // The themed icon (Android 13 and later) is the claws alone, in one colour the system tints.
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: '#e2711d',
    },
    // Back previews the screen underneath (Android 14 and later); the leave-game prompt still
    // holds a live game (usePreventRemove).
    predictiveBackGestureEnabled: true,
    // The app keeps no files and draws over no other app; React Native's libraries ask for these.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    // The website's links (the same address the app shares, src/config.ts WEB_URL).
    intentFilters: linkFilters(process.env.EXPO_PUBLIC_WEB_URL ?? apiUrl),
  },
  web: {
    bundler: 'metro',
    output: 'single',
    name: 'ClawPlay',
    shortName: 'ClawPlay',
    favicon: './assets/favicon.png',
    themeColor: '#2a1608',
    backgroundColor: '#f6f1e7',
  },
  plugins: [
    'expo-router',
    // Game sounds only: no microphone, and nothing plays in the background.
    [
      'expo-audio',
      { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false },
    ],
    // No grey band behind Android's three navigation buttons: the page colour runs to the
    // bottom (the app keeps its content clear of them), with dark buttons on the light pages.
    ['expo-navigation-bar', { enforceContrast: false, style: 'dark' }],
    'expo-secure-store',
    // The device's language, and right-to-left layouts for Arabic (src/i18n/LanguageRoot.tsx).
    ['expo-localization', { supportsRTL: true }],
    // The icon on the brand colour while the app starts (hidden once it knows who is signed in).
    [
      'expo-splash-screen',
      { image: './assets/icon.png', imageWidth: 160, backgroundColor: '#2a1608' },
    ],
  ],
};

export default allowPlainHttp ? withPlainHttp(config) : config;
