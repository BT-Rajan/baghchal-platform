import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSession } from '@/auth/session';
import { isLinkToken } from '@/auth/validation';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { t } from '@/i18n';

/**
 * Opened from the optional link that confirms an account's email address,
 * `/verify-email?token=…`, signed in or not: it confirms the address and signs that account in.
 */
export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, state } = useSession();
  const router = useRouter();
  const verify = useMutation({
    mutationFn: async (linkToken: string) => {
      await session.start(await session.api.verifyEmail(linkToken));
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

  if (verify.isSuccess) {
    return (
      <Screen title={t('Email confirmed')} brand>
        <Button title={t('Play')} large onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  if (!valid || verify.isError) {
    // Signed in, a new link is sent from settings; signed out, sign in to get there.
    const signedIn = state.status === 'signedIn';
    return (
      <Screen title={t('Confirm your email')} brand>
        {valid ? (
          <ErrorNotice error={verify.error} />
        ) : (
          <Notice tone="error">{t('This link is invalid or has expired.')}</Notice>
        )}
        <Button
          title={signedIn ? t('Open settings') : t('Sign in')}
          large
          onPress={() => router.replace(signedIn ? '/settings' : '/sign-in')}
        />
      </Screen>
    );
  }
  return (
    <Screen title={t('Confirm your email')} brand>
      <Loading label={t('Confirming your email')} />
    </Screen>
  );
}
