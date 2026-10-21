import { act, render, screen } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Keyboard, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SNACKBAR_MS, SnackbarHost, SuccessNotice } from '@/components/Snackbar';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 40, left: 0, right: 0, bottom: 20 },
};

function app(children: ReactNode, host = true) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      {children}
      {host && <SnackbarHost />}
    </SafeAreaProvider>
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('in the apps, a success shows in the snackbar for four seconds, and is read out', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  await render(app(<SuccessNotice>Saved.</SuccessNotice>));
  expect(screen.getByTestId('snackbar')).toBeOnTheScreen();
  expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  // In a live region (Android), and announced (iOS).
  expect(screen.getByTestId('snackbar-host').props['aria-live']).toBe('polite');
  expect(announce).toHaveBeenCalledWith('Saved.');
  // Above the home indicator, not on it.
  expect(screen.getByTestId('snackbar-host')).toHaveStyle({ bottom: 20 + 8 });
  await act(() => jest.advanceTimersByTime(SNACKBAR_MS - 1));
  expect(screen.getByText('Saved.')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1));
  expect(screen.queryByText('Saved.')).toBeNull();
});

test('a newer success takes the place of the last, and gets its own four seconds', async () => {
  await render(app(<SuccessNotice>You left the tournament.</SuccessNotice>));
  await act(() => jest.advanceTimersByTime(3000));
  await screen.rerender(app(<SuccessNotice>Saved.</SuccessNotice>));
  expect(screen.queryByText('You left the tournament.')).toBeNull();
  await act(() => jest.advanceTimersByTime(3000));
  expect(screen.getByText('Saved.')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1000));
  expect(screen.queryByText('Saved.')).toBeNull();
});

test('it sits above the tab bar of the screen that showed it', async () => {
  await render(
    app(
      <BottomTabBarHeightContext.Provider value={80}>
        <SuccessNotice>Challenge sent to bob.</SuccessNotice>
      </BottomTabBarHeightContext.Provider>,
    ),
  );
  expect(screen.getByTestId('snackbar-host')).toHaveStyle({ bottom: 80 + 8 });
});

test('it sits above the keyboard while the keyboard is up', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const listeners = new Map<string, (event: unknown) => void>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    listeners.set(name, listener as (event: unknown) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  await render(app(<SuccessNotice>Saved.</SuccessNotice>));
  await act(() => listeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } }));
  expect(screen.getByTestId('snackbar-host')).toHaveStyle({ bottom: 300 + 8 });
  await act(() => listeners.get('keyboardDidHide')?.({}));
  expect(screen.getByTestId('snackbar-host')).toHaveStyle({ bottom: 20 + 8 });
});

test('on the web, the success stays in place, as a notice', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await render(app(<SuccessNotice>Saved.</SuccessNotice>));
  expect(screen.queryByTestId('snackbar')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  await act(() => jest.advanceTimersByTime(SNACKBAR_MS));
  expect(screen.getByText('Saved.')).toBeOnTheScreen();
});

test('with no snackbar mounted, the success stays in place', async () => {
  await render(app(<SuccessNotice>Saved.</SuccessNotice>, false));
  expect(screen.queryByTestId('snackbar')).toBeNull();
  expect(screen.getByText('Saved.')).toBeOnTheScreen();
});
