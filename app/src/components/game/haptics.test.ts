import * as Haptics from 'expo-haptics';

import { playSound } from './sound';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

test('without Web Audio, the phone vibrates for each moment of the game', () => {
  playSound('move');
  playSound('capture');
  playSound('win');
  playSound('loss');
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
});

test('a phone that cannot vibrate is fine', async () => {
  (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('no vibrator'));
  expect(() => playSound('move')).not.toThrow();
  await Promise.resolve();
});
