import { navigationBarStyle } from './navigationBar';
import { statusBarStyle } from './statusBar';

test('light status icons over the brand bars and the welcome page, in either scheme', () => {
  for (const scheme of ['light', 'dark'] as const) {
    expect(statusBarStyle('game/[id]', true, scheme)).toBe('light');
    expect(statusBarStyle('challenge/[username]', true, scheme)).toBe('light');
    expect(statusBarStyle('(tabs)', false, scheme)).toBe('light');
    expect(statusBarStyle('welcome', false, scheme)).toBe('light');
  }
});

test('over a page with no bar, icons that read on the page', () => {
  expect(statusBarStyle('sign-in', false, 'light')).toBe('dark');
  expect(statusBarStyle('challenge/[username]', false, 'light')).toBe('dark');
  expect(statusBarStyle('+not-found', false, 'light')).toBe('dark');
  expect(statusBarStyle('sign-in', false, 'dark')).toBe('light');
  expect(statusBarStyle('sign-in', false)).toBe('dark'); // the tests' scheme: light
});

test('light navigation buttons on the welcome page and after dark', () => {
  expect(navigationBarStyle('welcome', 'light')).toBe('light');
  expect(navigationBarStyle('(tabs)', 'light')).toBe('dark');
  expect(navigationBarStyle('sign-in')).toBe('dark');
  expect(navigationBarStyle('(tabs)', 'dark')).toBe('light');
  expect(navigationBarStyle('game/[id]', 'dark')).toBe('light');
});
