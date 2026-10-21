import { useMutation } from '@tanstack/react-query';

import { peekReturn } from '@/auth/returnTo';
import { useApi, useSession } from '@/auth/session';
import { useOpenStartedGame } from '@/lobby/hooks';

import { useAgreement } from './AgreementLine';

/**
 * A newcomer's first game: the Easy computer, which coaches as they play, and an unhurried
 * Standard time control. The goats move first, so there is something to do at once.
 */
const FIRST_GAME = { level: 'easy', time_control: '5+3' } as const;

export type FirstSide = 'goat' | 'tiger';

/**
 * Play at once as a guest, accepting the terms by playing: the one way in without an account,
 * from the web's landing page and the apps' start screen. Someone who came from a friend's link
 * goes on to it (see the route guards in _layout) instead of the computer.
 */
export function useStartAsGuest() {
  const { session } = useSession();
  const api = useApi();
  const openStarted = useOpenStartedGame();
  const agreement = useAgreement();
  const play = useMutation({
    mutationFn: async (side: FirstSide) => {
      const body = agreement.body;
      if (body === null) return; // the terms are still loading (the button waits for them)
      const goingOn = peekReturn() !== null;
      await session.playAsGuest(body);
      if (goingOn) return;
      const game = await api.playComputer({ ...FIRST_GAME, side });
      // Open it once the screens for signed-in players are in place, or their guard would send
      // the game back to the welcome page.
      await new Promise((resolve) => setTimeout(resolve, 0));
      openStarted(game);
    },
  });
  const start = (side: FirstSide = 'goat') => {
    play.reset();
    play.mutate(side);
  };
  return { agreement, play, start, waiting: play.isPending || agreement.versions.isPending };
}
