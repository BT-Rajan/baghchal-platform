import { chatRefreshMs } from './hooks';

test('chat is asked again only while it stays open after the game', () => {
  expect(chatRefreshMs(true, true)).toBe(30_000);
  expect(chatRefreshMs(true, false)).toBe(false);
  expect(chatRefreshMs(true, undefined)).toBe(false);
  expect(chatRefreshMs(false, true)).toBe(false);
});
