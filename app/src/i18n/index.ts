/**
 * The app's words in the player's language.
 *
 * Text is written in English where it is used, wrapped in `t()` (or `plural()`); each
 * catalog (`catalogs/<language>.json`) maps the English to that language, with the same
 * `{names}`. A text with no translation yet shows in English. The language is the player's
 * choice in their appearance (on the server, for every device), or this device's
 * (`auto`); `LanguageRoot` applies it.
 *
 * The translations are drafts until a native speaker has reviewed them.
 */
import ar from './catalogs/ar.json';
import hi from './catalogs/hi.json';
import ta from './catalogs/ta.json';

export type Language = 'en' | 'ta' | 'hi' | 'ar';
export type LanguageChoice = Language | 'auto';

/** Each language, named in itself (so anyone can find their own). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिन्दी',
  ar: 'العربية',
};

type Forms = Partial<Record<Intl.LDMLPluralRule, string>>;
type Catalog = Record<string, string | Forms>;

export const CATALOGS: Record<Exclude<Language, 'en'>, Catalog> = { ta, hi, ar };

/** How dates and numbers are written in each language (Arabic with the digits used here). */
const LOCALES: Record<Language, string> = {
  en: 'en-GB',
  ta: 'ta-IN',
  hi: 'hi-IN',
  ar: 'ar-u-nu-latn',
};

let current: Language = 'en';

export function setLanguage(language: Language): void {
  current = language;
}

export function language(): Language {
  return current;
}

/** The locale for `Intl` and `toLocale…String` in the current language. */
export function locale(): string {
  return LOCALES[current];
}

/** Whether the current language is written right to left. */
export function isRTL(): boolean {
  return current === 'ar';
}

/** The language a device's own language tags (most wanted first) pick, English if none. */
export function fromDevice(tags: readonly string[]): Language {
  for (const tag of tags) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base === 'en' || base === 'ta' || base === 'hi' || base === 'ar') return base;
  }
  return 'en';
}

/** The language to use: the player's choice, else the device's. */
export function effective(choice: LanguageChoice | undefined, device: Language): Language {
  return choice === undefined || choice === 'auto' ? device : choice;
}

function fill(text: string, params: Readonly<Record<string, string | number>> | undefined) {
  if (params === undefined) return text;
  // One pass, so a value (a username) is never read as a template.
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

function lookup(english: string): string | Forms | undefined {
  return current === 'en' ? undefined : CATALOGS[current][english];
}

/**
 * Marks a text to translate where it is written (a table of names made when the app loads)
 * and returns it as it is; `t()` translates it where it is shown.
 */
export function mark(english: string): string {
  return english;
}

/**
 * `english` in the current language, with its `{names}` filled from `params`. Call it as
 * the text is shown (never when a module loads, before the language is known).
 */
export function t(english: string, params?: Readonly<Record<string, string | number>>): string {
  const found = lookup(english);
  return fill(typeof found === 'string' ? found : english, params);
}

/**
 * A text that depends on a count: `one` and `other` in English (`{count}` is the count);
 * a catalog gives each of its language's forms (Arabic has six) under `other`'s English.
 */
export function plural(
  count: number,
  one: string,
  other: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const values = { count, ...params };
  const found = lookup(other);
  if (found === undefined || typeof found === 'string') {
    return fill(found ?? (count === 1 ? one : other), values);
  }
  const form = new Intl.PluralRules(LOCALES[current]).select(count);
  return fill(found[form] ?? found.other ?? other, values);
}
