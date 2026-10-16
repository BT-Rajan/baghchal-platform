import type { ExpoConfig } from 'expo/config';

// The only configuration the app has is public: where the API lives. No secrets belong here,
// and no Expo-cloud settings (EAS project ID, updates URL) — see docs/adr/0002.
const config: ExpoConfig = {
  name: 'Bagh Chal',
  slug: 'baghchal',
  scheme: 'baghchal',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: { supportsTablet: true, bundleIdentifier: 'com.baghchal.app' },
  android: { package: 'com.baghchal.app' },
  web: { bundler: 'metro', output: 'single' },
  plugins: ['expo-router', 'expo-secure-store'],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000',
  },
};

export default config;
