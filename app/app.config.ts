import type { ExpoConfig } from 'expo/config';

import { apiUrlProblem } from './src/apiUrl.js';

// No secrets belong here (the API's address, EXPO_PUBLIC_API_URL, is read in src/config.ts),
// and no Expo-cloud settings (EAS project ID, updates URL): see docs/adr/0002.
// A release build must not send passwords and tokens over plain http (see src/apiUrl.ts).
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const problem =
  apiUrl === undefined ? null : apiUrlProblem(apiUrl, process.env.NODE_ENV === 'production');
if (problem !== null) throw new Error(problem);

const config: ExpoConfig = {
  name: 'Bagh Chal',
  slug: 'baghchal',
  scheme: 'baghchal',
  version: '0.1.0',
  orientation: 'default',
  // Light only until the theme has a dark palette.
  userInterfaceStyle: 'light',
  ios: { supportsTablet: true, bundleIdentifier: 'com.baghchal.app' },
  android: { package: 'com.baghchal.app' },
  web: { bundler: 'metro', output: 'single' },
  plugins: ['expo-router', 'expo-secure-store'],
};

export default config;
