import { useMutation } from '@tanstack/react-query';

import type { Agreement } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useApi, useSession } from '@/auth/session';
import { AgreementLine, useAgreement } from '@/components/AgreementLine';
import { t } from '@/i18n';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useOpenStartedGame } from '@/lobby/hooks';

/**
 * A newcomer's first game: the Easy computer, which coaches as they play, with the goats (who
 * move first, so there is something to do at once) and an unhurried Standard time control.
 */
const FIRST_GAME = { level: 'easy', side: 'goat', time_control: '5+3' } as const;

/** Play at once as a guest: nothing to type, only the agreement to accept. */
export default function Start() {
  const { session } = useSession();
  const api = useApi();
  const openStarted = useOpenStartedGame();
  const agreement = useAgreement();
  const play = useMutation({
    mutationFn: async (body: Agreement) => {
      await session.playAsGuest(body);
      const game = await api.playComputer(FIRST_GAME);
      // Open it once the screens for signed-in players are in place, or their guard would send
      // the game back to the welcome page.
      await new Promise((resolve) => setTimeout(resolve, 0));
      openStarted(game);
    },
  });

  const start = () => {
    play.reset();
    if (agreement.body) play.mutate(agreement.body);
  };

  return (
    <Screen title={t('Your first game')} brand>
      {play.error !== null && <Notice tone="error">{describeError(play.error)}</Notice>}
      <AgreementLine agreement={agreement} />
      <Button
        title={t('Accept and play')}
        onPress={start}
        busy={play.isPending || agreement.versions.isPending}
      />
      <TextLink href="/sign-in">{t('Already have an account? Sign in')}</TextLink>
    </Screen>
  );
}
