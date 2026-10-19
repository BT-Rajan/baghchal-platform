import { Platform } from 'react-native';

import { pressedLook, ripple } from './press';

test('Android ripples, and keeps no pressed style', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(ripple().android_ripple?.color).toBeDefined();
  expect(ripple(true).android_ripple?.color).not.toBe(ripple().android_ripple?.color);
  expect(pressedLook(true, { opacity: 0.5 })).toBeNull();
});

test('elsewhere the pressed style shows, and there is no ripple', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  expect(ripple()).toEqual({});
  expect(pressedLook(true, { opacity: 0.5 })).toEqual({ opacity: 0.5 });
  expect(pressedLook(false, { opacity: 0.5 })).toBeNull();
});
