import { screen } from 'expo-router/testing-library';

import { renderApp } from './support/app';

test('anyone can read how to delete an account, signed in or not', async () => {
  await renderApp('/delete-account');
  expect(await screen.findByText(/^3\. Choose Account, then Delete account/)).toBeOnTheScreen();
  expect(screen.getByText(/^2\. Open Me, then Settings/)).toBeOnTheScreen();
  expect(screen.getByRole('link', { name: /^Privacy policy/ })).toBeOnTheScreen();
});
