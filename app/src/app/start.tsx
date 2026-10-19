import { useMutation } from '@tanstack/react-query';

import { describeError } from '@/api/errors';
import { useApi, useSession } from '@/auth/session';
import { AgreementFields, useAgreement } from '@/components/AgreementFields';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { AGREEMENT_CODE_FIELDS, AGREEMENT_FIELDS } from '@/legal/agreement';
import { useOpenStartedGame } from '@/lobby/hooks';

/**
 * A newcomer's first game: the Easy computer, which coaches as they play, with the goats (who
 * move first, so there is something to do at once) and the longest time control.
 */
const FIRST_GAME = { level: 'easy', side: 'goat', time_control: '15+10' } as const;

/** Play at once as a guest: only the age and the agreement are asked first. */
export default function Start() {
  const { session } = useSession();
  const api = useApi();
  const openStarted = useOpenStartedGame();
  const agreement = useAgreement({ guest: true });
  const play = useMutation({
    mutationFn: async (body: NonNullable<ReturnType<typeof agreement.check>['body']>) => {
      const { parent_email: _, ...guest } = body;
      await session.playAsGuest(guest);
      const game = await api.playComputer(FIRST_GAME);
      // Open it once the screens for signed-in players are in place, or their guard would send
      // the game back to the welcome page.
      await new Promise((resolve) => setTimeout(resolve, 0));
      openStarted(game);
    },
  });
  const { fieldError, formMessage, accept } = useFormErrors(
    AGREEMENT_FIELDS,
    play.error,
    AGREEMENT_CODE_FIELDS,
  );

  const start = () => {
    play.reset();
    const { problems, body } = agreement.check();
    if (accept(problems) && body) play.mutate(body);
  };

  return (
    <Screen title="Your first game" brand>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      {agreement.versions.isError && (
        <Notice tone="error">{describeError(agreement.versions.error)}</Notice>
      )}
      <AgreementFields agreement={agreement} fieldError={fieldError} />
      <Button
        title="Start playing"
        onPress={start}
        busy={play.isPending || agreement.versions.isPending}
      />
      <TextLink href="/sign-in">Already have an account? Sign in</TextLink>
    </Screen>
  );
}
