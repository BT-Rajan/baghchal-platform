/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/api/schema.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    // Screens and components (everything not listed below) are exercised through the router.
    global: { statements: 92, branches: 84, functions: 89, lines: 93 },
    // The logic the app depends on is fully covered.
    './src/api/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/auth/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/game/': { branches: 100, functions: 100, lines: 100, statements: 100 },
    './src/realtime/': { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
