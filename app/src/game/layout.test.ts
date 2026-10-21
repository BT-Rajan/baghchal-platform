import { boardSize, gameLayout } from './layout';

test('gameLayout', () => {
  expect(gameLayout(390, 844)).toBe('stacked'); // phone, upright
  expect(gameLayout(844, 390)).toBe('short'); // phone on its side
  expect(gameLayout(560, 400)).toBe('stacked'); // too narrow to sit side by side
  expect(gameLayout(820, 1180)).toBe('stacked'); // tablet, upright
  expect(gameLayout(1180, 820)).toBe('side'); // tablet on its side
  expect(gameLayout(1280, 800)).toBe('side'); // desktop
  expect(gameLayout(1280, 560)).toBe('short'); // short browser window
});

const NONE = { top: 0, bottom: 0, left: 0, right: 0 };
const browser = { header: 64, insets: NONE };

test('boardSize keeps both clocks on screen', () => {
  expect(boardSize('stacked', 390, 844, { header: 103, insets: { ...NONE, bottom: 34 } })).toBe(
    390,
  );
  // Room for the header, the page's padding, two player bars and the letters under the board.
  expect(boardSize('stacked', 390, 500, browser)).toBe(500 - 64 - 48 - 148 - 18);
  expect(boardSize('side', 1280, 800, browser)).toBe(800 - 64 - 48 - 148 - 18);
  expect(boardSize('side', 1920, 1200, browser)).toBe(640);
  expect(boardSize('stacked', 320, 300, browser)).toBe(200); // never unusably small
});

test('a phone on its side fits the board below its header, clear of the notch', () => {
  // Android: the header includes the status bar; the navigation buttons are at the side.
  expect(
    boardSize('short', 844, 390, { header: 80, insets: { ...NONE, top: 24, right: 48 } }),
  ).toBe(390 - 80 - 48 - 18);
  // iPhone: no header (the status bar inset counts instead), the notch and home indicator.
  const iphone = { top: 0, bottom: 21, left: 47, right: 47 };
  expect(boardSize('short', 844, 390, { header: 0, insets: { ...iphone, top: 20 } })).toBe(
    390 - 20 - 21 - 48 - 18,
  );
  // A wide window still takes half the width less the insets at most.
  expect(boardSize('short', 700, 2000, { header: 0, insets: iphone })).toBe((700 - 94) / 2);
});
