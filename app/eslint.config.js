// @ts-check
const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*', 'src/api/schema.ts'],
  },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/no-cycle': 'error',
    },
  },
]);
