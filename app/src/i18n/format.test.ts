import { setLanguage } from '.';
import { amountText, dateText, timeText } from './format';

afterEach(() => setLanguage('en'));

const MARCH_8 = new Date('2026-03-08T12:05:00Z');
const SEPT_30 = new Date('2026-09-30T23:59:00Z');

test('dates, in each language, the way CLDR writes them', () => {
  const cases = {
    en: ['8 Mar 2026', '8 March 2026', 'March 2026', '30 Sept 2026'],
    ta: ['8 மார்., 2026', '8 மார்ச், 2026', 'மார்ச் 2026', '30 செப்., 2026'],
    hi: ['8 मार्च 2026', '8 मार्च 2026', 'मार्च 2026', '30 सित॰ 2026'],
    ar: ['8 مارس 2026', '8 مارس 2026', 'مارس 2026', '30 سبتمبر 2026'],
  } as const;
  for (const [language, expected] of Object.entries(cases)) {
    setLanguage(language as keyof typeof cases);
    expect([
      language,
      dateText(MARCH_8, { utc: true }),
      dateText(MARCH_8, { month: 'long', utc: true }),
      dateText(MARCH_8, { month: 'long', day: false, utc: true }),
      dateText(SEPT_30, { utc: true }),
    ]).toEqual([language, ...expected]);
  }
});

test('dates on the device’s own calendar by default', () => {
  const local = new Date(2026, 0, 1, 0, 30);
  expect(dateText(local)).toBe('1 Jan 2026');
});

test('times on the 24-hour clock', () => {
  expect(timeText(MARCH_8, { utc: true })).toBe('12:05');
  expect(timeText(new Date('2026-03-08T03:04:00Z'), { utc: true })).toBe('03:04');
  expect(timeText(new Date(2026, 0, 1, 21, 7))).toBe('21:07');
});

test('amounts, grouped the Indian way, with up to two decimals', () => {
  expect(amountText(0)).toBe('0');
  expect(amountText(149)).toBe('149');
  expect(amountText(1490)).toBe('1,490');
  expect(amountText(149.5)).toBe('149.5');
  expect(amountText(99.999)).toBe('100');
  expect(amountText(123456)).toBe('1,23,456');
  expect(amountText(1234567.25)).toBe('12,34,567.25');
  expect(amountText(-2990)).toBe('-2,990');
});
