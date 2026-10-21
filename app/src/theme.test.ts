import { setLanguage } from '@/i18n';

import { joinedLetters, spaced, type } from './theme';

afterEach(() => setLanguage('en'));

test('headings keep their spacing, except in Arabic, whose letters join', () => {
  expect(joinedLetters()).toBeNull();
  expect(spaced(0.5)).toBe(0.5);
  setLanguage('ar');
  // The styles were made at load, in English; drawn with this, the spacing goes.
  expect({ ...type.title, ...joinedLetters() }.letterSpacing).toBe(0);
  expect(spaced(0.5)).toBe(0);
});
