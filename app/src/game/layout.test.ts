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

test('boardSize keeps both clocks on screen', () => {
  expect(boardSize('stacked', 390, 844)).toBe(390);
  expect(boardSize('stacked', 390, 500)).toBe(260);
  expect(boardSize('short', 844, 390)).toBe(280);
  expect(boardSize('side', 1280, 800)).toBe(560);
  expect(boardSize('side', 1920, 1200)).toBe(640);
  expect(boardSize('stacked', 320, 300)).toBe(200); // never unusably small
});
