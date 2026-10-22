import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';

import { peekReturn } from '@/auth/returnTo';
import { useSession } from '@/auth/session';
import { AccountForm, type AccountDetails } from '@/components/AccountForm';
import { GoogleButton } from '@/components/GoogleButton';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';

/**
 * Make an account: signed in at once (the email is confirmed later, from its link, if ever),
 * then a new account's first stop, an optional board, pieces and friends. Someone who came from
 * a friend's link goes on to it instead (see the route guards in _layout).
 */
export default function SignUp() {
  const { session } = useSession();
  const register = useMutation({
    mutationFn: async (details: AccountDetails) => {
      const goingOn = peekReturn() !== null;
      await session.signUp(details);
      if (goingOn) return;
      // Once the screens for signed-in players are in place, or their guard would send it back.
      await new Promise((resolve) => setTimeout(resolve, 0));
      router.push('/make-it-yours');
    },
  });

  return (
    <Screen title={t('Sign up')} brand>
      <GoogleButton title={t('Sign up with Google')} />
      <AccountForm action={register} submitTitle={t('Sign up')} />
      <TextLink href="/sign-in">{t('I have an account')}</TextLink>
    </Screen>
  );
}
