/** The app's frame on Android (bars, the bell, links back), and where a link's back goes. */
import { router } from 'expo-router';
import { render } from '@testing-library/react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform, StyleSheet } from 'react-native';

import { BrandBar } from '@/components/brand/Logo';

import { renderApp } from './support/app';
import { ME, type Route } from './support/fakeServer';
import { BOB, challenge } from './support/games';

afterEach(() => jest.restoreAllMocks());

const LINK = challenge({ challenger: BOB, opponent: null, code: 'abc123', side: 'goat' });
const LINK_ROUTES: Record<string, Route> = {
  'GET /api/v1/challenges/link/abc123': { status: 200, body: LINK },
};

function open(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: ME }, ...routes },
  });
}

describe('back after a link', () => {
  test('a link opened from outside has Play underneath', async () => {
    const { app } = await open('/c/abc123', LINK_ROUTES);
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(true);
    await act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  test('after signing in on the way to a link, back goes to Play', async () => {
    const { app } = await renderApp('/c/abc123', {
      routes: {
        ...LINK_ROUTES,
        'POST /api/v1/auth/login': { status: 200, body: { user: ME, token: 'tok' } },
      },
    });
    await waitFor(() => expect(app.getPathname()).toBe('/welcome'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await fireEvent.changeText(await screen.findByLabelText('Username or email'), 'alice');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(app.getPathname()).toBe('/c/abc123'));
    await act(() => router.back());
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });
});

describe('on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

  test('the bar above the tabs is 64 tall, with a medium-weight title', async () => {
    await render(<BrandBar title="Leaderboard" />);
    expect(StyleSheet.flatten(screen.root?.props.style).minHeight).toBe(64);
    expect(
      StyleSheet.flatten(screen.getByRole('heading', { name: 'Leaderboard' }).props.style),
    ).toMatchObject({ fontSize: 20, fontWeight: '500' });
  });

  test('the bell is a round 48 button with a ripple', async () => {
    await open('/');
    const bell = await screen.findByRole('button', { name: 'Notifications' });
    expect(StyleSheet.flatten(bell.props.style)).toMatchObject({
      width: 48,
      height: 48,
      overflow: 'hidden',
    });
  });

  test('the tab bar has no line along its top', async () => {
    await open('/');
    let bar = (await screen.findByText('Leaderboard')).parent;
    while (bar !== null && StyleSheet.flatten(bar.props.style)?.minHeight === undefined) {
      bar = bar.parent;
    }
    expect(StyleSheet.flatten(bar?.props.style)).toMatchObject({ borderTopWidth: 0 });
  });

  test.each([
    ['/challenge/bob', 'Challenge bob', 'Send challenge'],
    ['/invite', 'Challenge a friend by link', 'Make a link'],
  ])('%s has the app bar, with its title in it', async (url, title, action) => {
    await open(url);
    expect(await screen.findByRole('button', { name: action })).toBeOnTheScreen();
    // The native bar draws the title (and the back arrow): the page does not repeat it.
    expect(screen.queryByRole('heading', { name: title })).toBeNull();
  });
});
