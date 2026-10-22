// Fails if the Android JavaScript bundle uses Intl that Hermes, the apps' engine, lacks: it
// works on the web and in tests but crashes a phone (as Intl.PluralRules once did in every
// language but English). Covers libraries too, which the lint rule cannot.
//   npx expo export --platform android --no-bytecode --output-dir <dir>
//   node scripts/check-hermes-bundle.mjs <dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Hermes has Collator, DateTimeFormat, NumberFormat and getCanonicalLocales (its "Intl APIs").
const MISSING =
  /\b(PluralRules|RelativeTimeFormat|ListFormat|DisplayNames|Segmenter|supportedValuesOf)\b|\bIntl\.Locale\b/g;

function* scripts(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) yield* scripts(join(path, name));
  } else if (path.endsWith('.js')) {
    yield path;
  }
}

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/check-hermes-bundle.mjs <exported bundle dir>');
  process.exit(2);
}
const problems = [];
let checked = 0;
for (const file of scripts(dir)) {
  checked += 1;
  const code = readFileSync(file, 'utf8');
  for (const match of code.matchAll(MISSING)) {
    const at = match.index;
    problems.push(`${file}: …${code.slice(Math.max(0, at - 80), at + 60)}…`);
  }
}
if (checked === 0) {
  console.error(`No JavaScript found in ${dir}.`);
  process.exit(2);
}
if (problems.length > 0) {
  console.error('The Android bundle uses Intl that Hermes lacks:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Hermes Intl check passed (${checked} file(s)).`);
