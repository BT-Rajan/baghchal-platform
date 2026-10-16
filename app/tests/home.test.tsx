import { render, screen } from '@testing-library/react-native';

import Home from '@/app/index';

test('shows the title', async () => {
  await render(<Home />);
  expect(screen.getByRole('header', { name: 'Bagh Chal' })).toBeOnTheScreen();
});
