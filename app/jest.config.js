/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/api/schema.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    // The logic the app depends on is fully covered; screens are covered by component tests.
    './src/api/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/auth/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/game/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/realtime/': { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
