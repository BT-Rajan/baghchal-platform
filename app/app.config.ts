import type { ExpoConfig } from 'expo/config';

// Per docs/adr/0002: no EAS project ID, no `updates.url`, nothing that reaches Expo's servers.
const config: ExpoConfig = {
  name: 'Bagh Chal',
  slug: 'baghchal',
  version: '0.1.0',
  scheme: 'baghchal',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.baghchal.app',
    supportsTablet: true,
  },
  android: {
    package: 'com.baghchal.app',
  },
  web: {
    output: 'single',
    bundler: 'metro',
  },
  plugins: ['expo-router', 'expo-secure-store'],
};

export default config;
