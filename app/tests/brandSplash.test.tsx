import { fireEvent, render, screen } from '@testing-library/react-native';

import { BrandSplash } from '@/components/brand/BrandSplash';

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
