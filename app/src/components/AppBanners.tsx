import { createContext } from 'react';

import { ChallengeBanner } from './ChallengeBanner';
import { ConnectionBanner } from './ConnectionBanner';

/**
 * Whether the banners for a signed-in player (connection lost, a challenge for me) belong on
 * the screens. On the web they sit under the top bar, for every page; in the apps each screen
 * shows them under its own header, so they never slide under the status bar.
 */
export const BannersOnScreens = createContext(false);

export function AppBanners() {
  return (
    <>
      <ConnectionBanner />
      <ChallengeBanner />
    </>
  );
}
