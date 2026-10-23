import { render } from '@testing-library/react-native';
import { fireEvent, screen } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { renderApp } from './support/app';

import { SiteFooter } from '@/components/site/SiteFooter';
import { ANDROID_APK_URL } from '@/config';

afterEach(() => jest.restoreAllMocks());

test('anyone can download the Android app, and is told how to install it', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await renderApp('/download', {
    routes: { 'GET /api/v1/me': { status: 401, body: { detail: 'Not signed in.' } } },
  });
  await fireEvent.press(await screen.findByRole('button', { name: 'Download for Android' }));
  expect(open).toHaveBeenCalledWith(ANDROID_APK_URL);
  expect(screen.getByRole('heading', { name: 'How to install' })).toBeOnTheScreen();
  expect(ANDROID_APK_URL).toMatch(/^https:\/\/.+\.apk$/);
});

test('the web footer leads to it', async () => {
  await render(<SiteFooter year={2026} />);
  expect(screen.getByText('Android app').props.href).toBe('/download');
});
