import { ACHIEVEMENTS, achievementCount, earnedText } from './achievements';

test('achievements in words', () => {
  expect(Object.keys(ACHIEVEMENTS)).toHaveLength(9);
  expect(ACHIEVEMENTS.trapped.text).toBe('Win by trapping the tigers.');
  expect(
    achievementCount([
      { key: 'first_win', earned_at: '2026-10-03T12:00:00Z' },
      { key: 'beat_hard', earned_at: null },
    ]),
  ).toBe('1 of 2 earned');
  expect(earnedText('2026-10-03T12:00:00Z')).toBe('Earned 3 Oct 2026');
});
