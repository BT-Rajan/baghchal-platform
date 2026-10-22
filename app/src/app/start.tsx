import { peekReturn } from '@/auth/returnTo';
import { AgreementLine } from '@/components/AgreementLine';
import { t } from '@/i18n';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useStartAsGuest } from '@/components/useStartAsGuest';

/** Play at once as a guest: nothing to type, only the agreement to accept. */
export default function Start() {
  const { agreement, play, start, waiting } = useStartAsGuest();

  // Someone who came from a friend's link goes on to it, not to the computer.
  const firstGame = peekReturn() === null;

  return (
    <Screen title={t('Play as a guest')} brand>
      {firstGame && <Hint>{t('You play the goats against the Easy computer.')}</Hint>}
      <ErrorNotice error={play.error} />
      <AgreementLine agreement={agreement} />
      <Button title={t('Play')} large onPress={() => start('goat')} busy={waiting} />
      <TextLink href="/sign-in">{t('I have an account')}</TextLink>
    </Screen>
  );
}
