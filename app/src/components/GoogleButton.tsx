import { useMutation, useQuery } from '@tanstack/react-query';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { ApiError } from '@/api/errors';
import { builtInClientIds, googleClientId } from '@/auth/google';
import { useSession } from '@/auth/session';
import { t } from '@/i18n';

import { AgreementLine, useAgreement } from './AgreementLine';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

// On the web, Google's sign-in window comes back to this page, which hands the answer over.
WebBrowser.maybeCompleteAuthSession();

/** Whether Google sign-in is set up for this build, by its own ids or the server's. */
function useGoogleClientId(): string | null {
  const { session } = useSession();
  const builtIn = builtInClientIds();
  const own = googleClientId(Platform.OS, builtIn, undefined);
  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: ({ signal }) => session.api.authProviders(signal),
    enabled: own === null,
    staleTime: Infinity,
    // No answer: no Google button, and nothing to say about it.
    retry: false,
  });
  return own ?? googleClientId(Platform.OS, builtIn, providers.data);
}

/**
 * Sign in, or make an account, with Google: one press (which accepts the agreement, as the
 * short line under it says). Shows nothing where Google sign-in is not set up.
 */
export function GoogleButton({
  title,
  onDark = false,
}: {
  /** "Sign up with Google" or "Sign in with Google": the same either way. */
  title: string;
  /** On the brand's dark colour (the apps' start screen). */
  onDark?: boolean;
}) {
  const clientId = useGoogleClientId();
  if (clientId === null) return null;
  return <GoogleSignIn clientId={clientId} title={title} onDark={onDark} />;
}

function GoogleSignIn({
  clientId,
  title,
  onDark,
}: {
  clientId: string;
  title: string;
  onDark: boolean;
}) {
  const { session } = useSession();
  const agreement = useAgreement();
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    webClientId: clientId,
    androidClientId: clientId,
    iosClientId: clientId,
    selectAccount: true,
  });
  // Signing in swaps this screen for the signed-in ones (see the route guards in _layout).
  const signIn = useMutation({
    mutationFn: async (idToken: string) => {
      const { body } = agreement;
      if (body !== null) await session.signInWithGoogle(idToken, body);
    },
  });
  const { mutate } = signIn;
  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token ?? response.authentication?.idToken;
    if (idToken) mutate(idToken);
  }, [response, mutate]);
  const failed =
    response?.type === 'error'
      ? new ApiError(0, 'google_failed', t("Google sign-in didn't work. Try again."))
      : null;
  return (
    <>
      <ErrorNotice error={signIn.error ?? failed} />
      <Button
        title={title}
        variant={onDark ? 'light' : 'secondary'}
        large
        busy={signIn.isPending || agreement.versions.isPending}
        disabled={request === null || agreement.body === null}
        onPress={() => {
          signIn.reset();
          void prompt();
        }}
      />
      <AgreementLine agreement={agreement} onDark={onDark} />
    </>
  );
}
