// Fails if the app could reach Expo's cloud services (docs/adr/0002-no-dependency-on-expo-cloud.md).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const FORBIDDEN = [
  [/u\.expo\.dev/, 'EAS Update URL'],
  [/exp\.host/, 'Expo push service'],
  [/getExpoPushTokenAsync/, 'Expo push tokens (use getDevicePushTokenAsync)'],
  [/projectId/, 'EAS project ID'],
  [/["']eas["']\s*:/, 'EAS config'],
];
const FORBIDDEN_DEPENDENCIES = ['expo-updates', 'eas-cli', 'expo-insights'];
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.expo', 'scripts', 'ios', 'android']);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(name) && name !== 'package-lock.json') yield path;
  }
}

const problems = [];
for (const path of files(root)) {
  const text = readFileSync(path, 'utf8');
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(text)) problems.push(`${relative(root, path)}: ${what} (${pattern})`);
  }
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const name of FORBIDDEN_DEPENDENCIES) {
  if (name in deps) problems.push(`package.json: forbidden dependency ${name}`);
}
if (problems.length) {
  console.error('Expo cloud guard failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
process.stdout.write('Expo cloud guard: ok\n');
