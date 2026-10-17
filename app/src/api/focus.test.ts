import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { followAppFocus } from './focus';

test('apps report foreground and background to the query cache', () => {
  const listeners: ((state: string) => void)[] = [];
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  const setFocused = jest.spyOn(focusManager, 'setFocused');
  const stop = followAppFocus('ios');
  listeners.forEach((l) => l('background'));
  listeners.forEach((l) => l('active'));
  expect(setFocused.mock.calls).toEqual([[false], [true]]);
  stop();
  expect(remove).toHaveBeenCalled();
  jest.restoreAllMocks();
});

test('browsers need nothing', () => {
  const add = jest.spyOn(AppState, 'addEventListener');
  const before = add.mock.calls.length; // other code may already listen
  followAppFocus('web')();
  expect(add.mock.calls.length).toBe(before);
  jest.restoreAllMocks();
});

test('defaults to this platform', () => {
  const stop = followAppFocus();
  expect(typeof stop).toBe('function');
  stop();
});
