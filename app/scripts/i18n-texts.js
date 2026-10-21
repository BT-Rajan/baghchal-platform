// The English texts the app translates: every literal given to t(), plural() or mark() in
// src. Used by the catalogs' test (src/i18n/catalogs.test.ts) and, for translators, by
// `npm run i18n:missing`, which prints what each catalog still lacks.
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const NAMES = new Set(['t', 'plural', 'mark']);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every text, mapped to whether it is plural()'s (its catalog entry holds the forms). */
function englishTexts(root = path.join(__dirname, '..', 'src')) {
  const found = new Map();
  for (const file of files(root)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        NAMES.has(node.expression.text)
      ) {
        const name = node.expression.text;
        // plural()'s catalog entry is under its `other` form, with every form of the language.
        const arg = node.arguments[name === 'plural' ? 2 : 0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          found.set(arg.text, name === 'plural' || found.get(arg.text) === true);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

module.exports = { englishTexts };

if (require.main === module) {
  const texts = englishTexts();
  const missing = {};
  for (const language of ['ta', 'hi', 'ar']) {
    const catalog = require(`../src/i18n/catalogs/${language}.json`);
    missing[language] = [...texts.keys()].filter((text) => !(text in catalog)).sort();
  }
  process.stdout.write(`${JSON.stringify(missing, null, 1)}\n`);
}
