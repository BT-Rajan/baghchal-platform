import { BOARDS, FREE_APPEARANCE, isThemed, PIECES, SOUNDS } from './catalog';

test('the first of each is free; anything else needs themes', () => {
  expect(isThemed(FREE_APPEARANCE)).toBe(false);
  expect(isThemed({ ...FREE_APPEARANCE, board: 'jade' })).toBe(true);
  expect(isThemed({ ...FREE_APPEARANCE, pieces: 'royal' })).toBe(true);
  expect(isThemed({ ...FREE_APPEARANCE, sounds: 'arcade' })).toBe(true);
});

test('every choice has a name', () => {
  for (const choice of [BOARDS, PIECES, SOUNDS]) {
    for (const { name } of Object.values(choice)) expect(name).not.toBe('');
  }
});
