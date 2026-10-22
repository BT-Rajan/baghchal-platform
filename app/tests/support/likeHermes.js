// Every test runs with the JavaScript the apps have. Hermes, the apps' engine, has only part of
// Intl (Collator, DateTimeFormat, NumberFormat, getCanonicalLocales): anything else, called on
// a phone, crashes the app, while browsers and Node have it, so the web and tests would pass.
// Taking the rest away here makes a test fail instead (as Intl.PluralRules once crashed every
// language but English). The list follows Hermes's "Intl APIs" page.
const HERMES_INTL = new Set(['Collator', 'DateTimeFormat', 'NumberFormat', 'getCanonicalLocales']);

for (const name of Object.getOwnPropertyNames(Intl)) {
  if (!HERMES_INTL.has(name)) delete Intl[name];
}
