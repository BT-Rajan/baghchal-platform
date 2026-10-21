import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { peekReturn } from '@/auth/returnTo';
import { useSession } from '@/auth/session';
import { isLinkToken } from '@/auth/validation';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';
import { colors } from '@/theme';

/** Opened from the link in the sign-up email: `/verify-email?token=…`. */
export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const verify = useMutation({
    mutationFn: async (linkToken: string) => {
      const goingOn = peekReturn() !== null;
      await session.start(await session.api.verifyEmail(linkToken));
      return goingOn;
    },
    // A new account's first stop: an optional board, pieces and friends. Someone who came from
    // a friend's link goes on to it instead (see the route guards in _layout).
    onSuccess: (goingOn) => {
      if (!goingOn) router.replace('/make-it-yours');
    },
  });
  // The token is single-use: send it once, even when effects run twice in development.
  const sent = useRef(false);
  const valid = isLinkToken(token);

  useEffect(() => {
    if (valid && !sent.current) {
      sent.current = true;
      verify.mutate(token);
    }
  }, [valid, token, verify]);

  if (!valid || verify.isError) {
    return (
      <Screen title={t('Confirm your email')} brand>
        {valid ? (
          <ErrorNotice error={verify.error} />
        ) : (
          <Notice tone="error">{t('This link is invalid or has expired.')}</Notice>
        )}
        <TextLink href="/sign-up">{t('Sign up again')}</TextLink>
        <TextLink href="/sign-in">{t('Sign in')}</TextLink>
      </Screen>
    );
  }
  return (
    <Screen title={t('Confirming your email…')} brand>
      <ActivityIndicator color={colors.accent} size="large" />
    </Screen>
  );
}
