const fs = require('node:fs');

// Pure logic must stay fully covered, as on the server. Folders are added to the plan as they
// are written; a folder that does not exist yet has nothing to cover.
const FULLY_COVERED = ['src/game', 'src/api', 'src/realtime', 'src/auth'];
const full = { branches: 100, functions: 100, lines: 100, statements: 100 };

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/*.test.{ts,tsx}'],
  coverageThreshold: Object.fromEntries(
    FULLY_COVERED.filter((dir) => fs.existsSync(dir)).map((dir) => [`./${dir}/`, full]),
  ),
};
