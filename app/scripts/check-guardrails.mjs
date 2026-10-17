// Fails if the app could talk to Expo's cloud services (docs/adr/0002-no-dependency-on-expo-cloud.md).
// Scans the app config, package manifests and source; run from app/.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORBIDDEN = [
  [/u\.expo\.dev/, 'EAS Update URL'],
  [/exp\.host/, 'Expo Push service'],
  [/\bprojectId\b/, 'EAS project ID'],
  [/expo-updates/, 'expo-updates (EAS Update client)'],
  [/getExpoPushTokenAsync/, 'Expo push tokens (use getDevicePushTokenAsync)'],
];

const ROOTS = ['app.config.ts', 'package.json', 'package-lock.json', 'src'];
const SKIP_DIRS = new Set(['node_modules', '.expo', 'dist', 'coverage']);
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;

function* files(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) {
      if (!SKIP_DIRS.has(name)) yield* files(join(path, name));
    }
  } else if (EXTENSIONS.test(path)) {
    yield path;
  }
}

const problems = [];
for (const root of ROOTS) {
  for (const file of files(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [pattern, what] of FORBIDDEN) {
        if (pattern.test(line)) problems.push(`${relative('.', file)}:${i + 1}: ${what}`);
      }
    });
  }
}

if (problems.length > 0) {
  console.error('Expo-cloud guardrail failed (see docs/adr/0002):\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Expo-cloud guardrail passed.');
