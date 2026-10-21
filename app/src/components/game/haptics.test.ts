/** In the apps (no Web Audio) each moment of the game plays its pack's sound file and is felt. */
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { playSound, soundSupported } from './sound';
import { SOUND_FILES } from './soundFiles';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  performAndroidHapticsAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  AndroidHaptics: {
    Segment_Tick: 'segment-tick',
    Long_Press: 'long-press',
    Confirm: 'confirm',
    Reject: 'reject',
  },
}));

const mockPlay = jest.fn();
const mockSeekTo = jest.fn(async () => {});
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  createAudioPlayer: jest.fn(() => ({ play: mockPlay, seekTo: mockSeekTo })),
}));

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the apps play the packs from sound files', async () => {
  expect(soundSupported()).toBe(true);
  playSound('move', 'bells');
  playSound('move', 'bells');
  playSound('capture');
  await flush();
  expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  expect(setAudioModeAsync).toHaveBeenCalledWith({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
  });
  // One player per file, rewound for each play.
  expect(createAudioPlayer).toHaveBeenCalledTimes(2);
  expect(createAudioPlayer).toHaveBeenCalledWith(SOUND_FILES!.bells.move);
  expect(createAudioPlayer).toHaveBeenCalledWith(SOUND_FILES!.gentle.capture);
  expect(mockSeekTo).toHaveBeenCalledWith(0);
  expect(mockPlay).toHaveBeenCalledTimes(3);
});

test('a sound that cannot rewind still plays, and a failing player never breaks the game', async () => {
  mockSeekTo.mockRejectedValueOnce(new Error('not loaded'));
  playSound('win', 'arcade');
  await flush();
  expect(mockPlay).toHaveBeenCalledTimes(1);
  (createAudioPlayer as jest.Mock).mockImplementationOnce(() => {
    throw new Error('no audio');
  });
  expect(() => playSound('loss', 'arcade')).not.toThrow();
});

test('iOS taps, knocks and notifies', () => {
  playSound('move');
  playSound('capture');
  playSound('win');
  playSound('loss');
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
});

test("Android uses its own haptics, which follow the system's touch feedback", () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  playSound('move');
  playSound('capture');
  playSound('win');
  playSound('loss');
  expect((Haptics.performAndroidHapticsAsync as jest.Mock).mock.calls).toEqual([
    ['segment-tick'],
    ['long-press'],
    ['confirm'],
    ['reject'],
  ]);
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});

test('a phone that cannot vibrate is fine', async () => {
  (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('no vibrator'));
  expect(() => playSound('move')).not.toThrow();
  await flush();
});

test('the web without Web Audio stays quiet', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  expect(soundSupported()).toBe(false);
  playSound('move');
  expect(createAudioPlayer).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});
