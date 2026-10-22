// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'coverage/*', 'src/api/schema.d.ts'],
  },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The apps' engine (Hermes) formats through each phone's own libraries, unlike the browser,
    // and lacks most of Intl: both have crashed the app in other languages. Dates, times and
    // amounts come from src/i18n/format.ts, plural forms from pluralForm in src/i18n.
    files: ['src/**'],
    ignores: ['src/**/*.test.*'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Intl',
          message: 'Use src/i18n (format.ts, pluralForm): Intl differs or crashes on phones.',
        },
      ],
      'no-restricted-properties': [
        'error',
        ...['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].map((property) => ({
          property,
          message: 'Use src/i18n/format.ts: platform formatting differs or crashes on phones.',
        })),
      ],
    },
  },
  {
    files: ['scripts/**', 'e2e/**'],
    rules: { 'no-console': 'off' },
  },
]);
