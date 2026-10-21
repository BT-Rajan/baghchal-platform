import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { SiteFooter } from '@/components/site/SiteFooter';
import { WebTopBar } from '@/components/site/WebTopBar';

let mockStatus = 'signedIn';
jest.mock('@/auth/session', () => ({ useSession: () => ({ state: { status: mockStatus } }) }));
jest.mock('@/components/NotificationBell', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { NotificationBell: () => <MockText>bell</MockText> };
});

/** A page of the web app: the bar on top, a name, and the footer. */
function page(name: string, playing = true) {
  return function Page() {
    return (
      <>
        <WebTopBar playing={playing} />
        <Text>{`${name} page`}</Text>
        <SiteFooter year={2026} />
      </>
    );
  };
}

const ROUTES = {
  index: page('home'),
  leaderboard: page('leaderboard'),
  me: page('me'),
  settings: page('settings'),
  terms: page('terms'),
  privacy: page('privacy'),
  'sign-in': page('sign in', false),
  'sign-up': page('sign up', false),
};

describe('the web’s top bar and footer', () => {
  test('from any page: the logo goes home, the places are a click away, the current one shown', async () => {
    mockStatus = 'signedIn';
    const app = await renderRouter(ROUTES, { initialUrl: '/settings' });
    expect(screen.getByRole('link', { name: 'Me' })).toHaveProp('aria-current', 'page');
    expect(screen.getByText('bell')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Leaderboard' }));
    await waitFor(() => expect(app.getPathname()).toBe('/leaderboard'));
    await fireEvent.press(screen.getByLabelText('ClawPlay home'));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.getByRole('link', { name: 'Play' })).toHaveProp('aria-current', 'page');
  });

  test('every page ends with the copyright, the terms and the privacy policy', async () => {
    const app = await renderRouter(ROUTES, { initialUrl: '/leaderboard' });
    expect(screen.getByText('© 2026 ClawPlay. All rights reserved.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of service' }));
    await waitFor(() => expect(app.getPathname()).toBe('/terms'));
    await fireEvent.press(screen.getByRole('link', { name: 'Privacy policy' }));
    await waitFor(() => expect(app.getPathname()).toBe('/privacy'));
  });

  test('someone signed out is offered signing in and up, not the places', async () => {
    mockStatus = 'signedOut';
    const app = await renderRouter(ROUTES, { initialUrl: '/sign-in' });
    expect(screen.queryByRole('link', { name: 'Leaderboard' })).toBeNull();
    await fireEvent.press(screen.getByRole('link', { name: 'Make a free account' }));
    await waitFor(() => expect(app.getPathname()).toBe('/sign-up'));
  });
});
