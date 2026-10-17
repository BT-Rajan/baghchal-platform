import type { ExpoConfig } from 'expo/config';

// No secrets belong here (the API's address, EXPO_PUBLIC_API_URL, is read in src/config.ts),
// and no Expo-cloud settings (EAS project ID, updates URL): see docs/adr/0002.
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
