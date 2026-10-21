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
  scheme: 'clawplay',
  description: 'Bagh Chal, the tiger-and-goat game of Nepal, played live.',
  icon: './assets/icon.png',
  version: '0.1.0',
  orientation: 'default',
  // Light only until the theme has a dark palette.
  userInterfaceStyle: 'light',
  // The window behind the pages: the page colour, so the system's navigation bar area (and a
  // screen still drawing) match the app instead of showing white or black.
  backgroundColor: '#f6f1e7',
  ios: { supportsTablet: true, bundleIdentifier: 'com.clawplay.app' },
  android: {
    package: 'com.clawplay.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#e2711d' },
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
    // No grey band behind Android's three navigation buttons: the page colour runs to the
    // bottom (the app keeps its content clear of them), with dark buttons on the light pages.
    ['expo-navigation-bar', { enforceContrast: false, style: 'dark' }],
    'expo-secure-store',
    // The icon on the brand colour while the app starts (hidden once it knows who is signed in).
    [
      'expo-splash-screen',
      { image: './assets/icon.png', imageWidth: 160, backgroundColor: '#2a1608' },
    ],
  ],
};

export default allowPlainHttp ? withPlainHttp(config) : config;
