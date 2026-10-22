import { CATALOGS, plural, pluralForm, setLanguage, t, type Language } from '.';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { englishTexts } = require('../../scripts/i18n-texts.js') as {
  englishTexts: () => Map<string, boolean>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runInNewContext } = require('node:vm') as { runInNewContext: (code: string) => unknown };

const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each(Object.entries(CATALOGS))('the %s catalog', (language, catalog) => {
  const texts = englishTexts();

  it('has every text, and nothing else', () => {
    expect([...texts.keys()].filter((text) => !(text in catalog))).toEqual([]);
    expect(Object.keys(catalog).filter((text) => !texts.has(text))).toEqual([]);
  });

  it('keeps every {name}, and gives counted texts their forms', () => {
    for (const [text, translated] of Object.entries(catalog)) {
      const counted = texts.get(text) === true;
      const forms = typeof translated === 'string' ? { other: translated } : translated;
      expect([language, text, counted || typeof translated === 'string']).toEqual([
        language,
        text,
        true,
      ]);
      expect([text, 'other' in forms]).toEqual([text, true]);
      for (const form of Object.values(forms)) {
        expect([text, form.trim() !== '']).toEqual([text, true]);
        // A count may be left out of a form that says it in words ("a minute").
        const expected = names(text).filter((name) => !(counted && name === 'count'));
        expect([text, names(form).filter((n) => n !== 'count' || !counted)]).toEqual([
          text,
          expected,
        ]);
      }
    }
  });
});

describe('t and plural', () => {
  afterEach(() => setLanguage('en'));

  it('fill values in once, and fall back to English', () => {
    expect(t('{a} and {b}', { a: '{b}', b: 'x' })).toBe('{b} and x');
    expect(t('{a} stays', {})).toBe('{a} stays');
    expect(plural(1, '{count} game', '{count} games')).toBe('1 game');
    expect(plural(3, '{count} game', '{count} games', { who: 'x' })).toBe('3 games');
    setLanguage('ar');
    expect(t('Not translated anywhere')).toBe('Not translated anywhere');
    expect(plural(2, '{count} cat', '{count} cats')).toBe('2 cats');
  });

  it('pick the language’s form of a counted text', () => {
    CATALOGS.ar['{count} cats'] = {
      one: 'قطة',
      two: 'قطتان',
      few: '{count} قطط',
      other: '{count} قط',
    };
    CATALOGS.hi['{count} cats'] = 'बिल्लियाँ: {count}';
    setLanguage('ar');
    expect(plural(1, '{count} cat', '{count} cats')).toBe('قطة');
    expect(plural(2, '{count} cat', '{count} cats')).toBe('قطتان');
    expect(plural(5, '{count} cat', '{count} cats')).toBe('5 قطط');
    expect(plural(100, '{count} cat', '{count} cats')).toBe('100 قط');
    setLanguage('hi');
    expect(plural(4, '{count} cat', '{count} cats')).toBe('बिल्लियाँ: 4');
    delete CATALOGS.ar['{count} cats'];
    delete CATALOGS.hi['{count} cats'];
  });
});

describe('plural forms, as on a phone', () => {
  it('need no Intl.PluralRules (the apps have none; tests take it away too)', () => {
    expect('PluralRules' in Intl).toBe(false);
    setLanguage('ar');
    CATALOGS.ar['{count} cats'] = { one: 'قطة', other: '{count} قط' };
    expect(plural(1, '{count} cat', '{count} cats')).toBe('قطة');
    delete CATALOGS.ar['{count} cats'];
    setLanguage('en');
  });

  it.each<[Language, string]>([
    ['en', 'en-GB'],
    ['ta', 'ta-IN'],
    ['hi', 'hi-IN'],
    ['ar', 'ar'],
  ])('follow CLDR’s rules in %s', (language, tag) => {
    // CLDR's own rules, from a fresh context's Intl (this one's has been taken away).
    const cldr = runInNewContext(`new Intl.PluralRules(${JSON.stringify(tag)})`) as {
      select: (n: number) => string;
    };
    const counts = [...Array(1001).keys(), 0.5, 1.5, 2.5, 101.5];
    expect(counts.filter((n) => pluralForm(language, n) !== cldr.select(n))).toEqual([]);
  });
});
