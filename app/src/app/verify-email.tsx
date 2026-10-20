import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { describeError } from '@/api/errors';
import { useSession } from '@/auth/session';
import { isLinkToken } from '@/auth/validation';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { colors } from '@/theme';

/** Opened from the link in the sign-up email: `/verify-email?token=…`. */
export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const verify = useMutation({
    mutationFn: async (linkToken: string) => {
      await session.start(await session.api.verifyEmail(linkToken));
    },
    // A new account's first stop: an optional board, pieces and friends.
    onSuccess: () => router.replace('/make-it-yours'),
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
      <Screen title="Confirm your email" brand>
        <Notice tone="error">
          {valid ? describeError(verify.error) : 'This link is invalid or has expired.'}
        </Notice>
        <TextLink href="/sign-up">Sign up again</TextLink>
        <TextLink href="/sign-in">Sign in</TextLink>
      </Screen>
    );
  }
  return (
    <Screen title="Confirming your email…" brand>
      <ActivityIndicator color={colors.accent} size="large" />
    </Screen>
  );
}
