import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { ShareButton, canShare } from './ShareButton';

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { navigator?: unknown }).navigator;
});

test('the apps always have a share sheet; browsers only when they offer one', () => {
  expect(canShare('ios')).toBe(true);
  expect(canShare('android')).toBe(true);
  expect(canShare('web')).toBe(false);
  (globalThis as { navigator?: unknown }).navigator = { share: () => Promise.resolve() };
  expect(canShare('web')).toBe(true);
});

test('shares the full address, and a failure is only logged', async () => {
  const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('no'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await render(<ShareButton path="/tournament/cup1" title="Share the tournament" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share the tournament' }));
  expect(share).toHaveBeenCalledWith({ url: 'http://localhost:8000/tournament/cup1' });
  await waitFor(() =>
    expect(warn).toHaveBeenCalledWith('Could not share the link', expect.any(Error)),
  );
});
