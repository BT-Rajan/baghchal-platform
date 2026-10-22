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
    // The apps' engine (Hermes) has only Collator, DateTimeFormat, NumberFormat and
    // getCanonicalLocales of Intl; the rest crash a phone (tests/support/likeHermes.js).
    files: ['src/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          'PluralRules',
          'RelativeTimeFormat',
          'ListFormat',
          'Locale',
          'DisplayNames',
          'Segmenter',
          'supportedValuesOf',
        ].map((property) => ({
          object: 'Intl',
          property,
          message: 'Not in the apps’ JavaScript engine (Hermes): it crashes on a phone.',
        })),
      ],
    },
  },
  {
    files: ['scripts/**', 'e2e/**'],
    rules: { 'no-console': 'off' },
  },
]);
