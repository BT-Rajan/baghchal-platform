import { render, screen } from '@testing-library/react-native';
import { HeaderHeightContext, NavigationContext } from 'expo-router/react-navigation';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BannersOnScreens } from '@/components/AppBanners';
import { Screen } from '@/components/Screen';

jest.mock('@/components/AppBanners', () => {
  const { createContext } = jest.requireActual('react');
  const { Text: MockText } = jest.requireActual('react-native');
  return { BannersOnScreens: createContext(false), AppBanners: () => <MockText>banners</MockText> };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 30, left: 0, right: 0, bottom: 20 },
};

function wrap(children: ReactNode) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

test('under an app bar: the title goes in the bar, and the banners under it', async () => {
  const setOptions = jest.fn();
  const navigation = { setOptions } as unknown as React.ContextType<typeof NavigationContext>;
  await render(
    wrap(
      <NavigationContext.Provider value={navigation}>
        <HeaderHeightContext.Provider value={56}>
          <BannersOnScreens.Provider value>
            <Screen title="Friday cup">
              <Text>body</Text>
            </Screen>
          </BannersOnScreens.Provider>
        </HeaderHeightContext.Provider>
      </NavigationContext.Provider>,
    ),
  );
  expect(setOptions).toHaveBeenCalledWith({ title: 'Friday cup' });
  expect(screen.queryByRole('heading', { name: 'Friday cup' })).toBeNull();
  expect(screen.getByText('banners')).toBeOnTheScreen();
});

test('in the tabs, and without a bar, the title stays in the page', async () => {
  await render(
    wrap(
      <HeaderHeightContext.Provider value={56}>
        <BottomTabBarHeightContext.Provider value={66}>
          <Screen title="Leaderboard">
            <Text>body</Text>
          </Screen>
        </BottomTabBarHeightContext.Provider>
      </HeaderHeightContext.Provider>,
    ),
  );
  expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeOnTheScreen();
  expect(screen.queryByText('banners')).toBeNull(); // not signed in to a game of people
  await render(wrap(<Screen title="Sign in">{null}</Screen>));
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeOnTheScreen();
});
