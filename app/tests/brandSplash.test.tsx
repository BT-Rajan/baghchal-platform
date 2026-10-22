import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { BrandSplash, SPLASH_FADE_MS } from '@/components/brand/BrandSplash';

test('the opening screen shows the claw mark, the name and what the game is', async () => {
  const shown = jest.fn();
  await render(<BrandSplash onShown={shown} />);
  expect(screen.getByText('Claw')).toBeOnTheScreen();
  expect(screen.getByText('Play')).toBeOnTheScreen();
  expect(screen.getByText('Bagh Chal · tigers and goats, played live')).toBeOnTheScreen();
  expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  // Once drawn, the system splash (the icon only) gives way to it.
  await fireEvent(screen.getByTestId('brand-splash'), 'layout', {
    nativeEvent: { layout: { width: 400, height: 800, x: 0, y: 0 } },
  });
  expect(shown).toHaveBeenCalled();
});

test('it fades away over the first screen, then says so', async () => {
  jest.useFakeTimers();
  const hidden = jest.fn();
  const { rerender } = await render(<BrandSplash onHidden={hidden} />);
  expect(hidden).not.toHaveBeenCalled();
  await rerender(<BrandSplash hiding onHidden={hidden} />);
  // While it fades, touches reach the screen underneath.
  expect(
    screen.getByTestId('brand-splash', { includeHiddenElements: true }).props.pointerEvents,
  ).toBe('none');
  await act(() => jest.advanceTimersByTime(SPLASH_FADE_MS / 2));
  expect(hidden).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(SPLASH_FADE_MS));
  expect(hidden).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test('without a fade it goes at once', async () => {
  const hidden = jest.fn();
  await render(<BrandSplash hiding fadeMs={0} onHidden={hidden} />);
  expect(hidden).toHaveBeenCalledTimes(1);
});
