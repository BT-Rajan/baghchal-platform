import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator } from 'react-native';

import { describeError } from '@/api/errors';
import { useSession } from '@/auth/session';
import { isLinkToken } from '@/auth/validation';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { colors } from '@/theme';

/** Opened from the link sent to a new email address: `/confirm-email?token=…`. */
export default function ConfirmEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { state, session } = useSession();
  const confirm = useMutation({
    mutationFn: async (linkToken: string) => {
      const changed = await session.api.confirmEmailChange(linkToken);
      // Signed in here: show the new address in Settings.
      await session.refresh().catch(() => {});
      return changed;
    },
  });
  // The token is single-use: send it once, even when effects run twice in development.
  const sent = useRef(false);
  const valid = isLinkToken(token);

  useEffect(() => {
    if (valid && !sent.current) {
      sent.current = true;
      confirm.mutate(token);
    }
  }, [valid, token, confirm]);

  const home = state.status === 'signedIn' ? '/me' : '/sign-in';
  const next = state.status === 'signedIn' ? 'Back to your account' : 'Sign in';
  if (!valid || confirm.isError) {
    return (
      <Screen title="Confirm your new email" brand>
        <Notice tone="error">
          {valid ? describeError(confirm.error) : 'This link is invalid or has expired.'}
        </Notice>
        <TextLink href={home}>{next}</TextLink>
      </Screen>
    );
  }
  if (confirm.isSuccess) {
    return (
      <Screen title="Email address changed" brand>
        <Notice tone="success">{`Your account now uses ${confirm.data.email}.`}</Notice>
        <TextLink href={home}>{next}</TextLink>
      </Screen>
    );
  }
  return (
    <Screen title="Confirming your new email…" brand>
      <ActivityIndicator color={colors.accent} size="large" />
    </Screen>
  );
}
