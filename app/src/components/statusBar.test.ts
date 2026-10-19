import { statusBarStyle } from './statusBar';

test('dark icons over light pages with no bar, light ones over the brand bars', () => {
  expect(statusBarStyle('/sign-in')).toBe('dark');
  expect(statusBarStyle('/challenge/bob')).toBe('dark');
  expect(statusBarStyle('/welcome')).toBe('light');
  expect(statusBarStyle('/')).toBe('light');
  expect(statusBarStyle('/game/g1')).toBe('light');
});
