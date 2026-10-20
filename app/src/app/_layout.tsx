import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import { followAppFocus } from '@/api/focus';
import { shouldRetry } from '@/api/retry';
import { SessionProvider, useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { ChallengeBanner } from '@/components/ChallengeBanner';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { statusBarStyle } from '@/components/statusBar';
import { WebTopBar } from '@/components/site/WebTopBar';
import { API_URL } from '@/config';
import { socketUrl } from '@/realtime/connection';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { colors } from '@/theme';

// The splash screen (the icon on the brand colour) stays until we know whether someone is signed
// in, so the app opens straight onto the right screen.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** In the apps, every screen's bar is the brand's dark bar, as Android and iOS apps have. */
const APP_BAR =
  Platform.OS === 'web'
    ? {}
    : {
        headerStyle: { backgroundColor: colors.brandInk },
        headerTintColor: colors.brandCream,
        headerTitleStyle: { color: colors.brandCream },
      };

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } }),
  );
  // Clearing also cancels the cache's clean-up timers (the root only unmounts in tests).
  useEffect(() => () => queryClient.clear(), [queryClient]);
  useEffect(followAppFocus, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider baseUrl={API_URL} queryClient={queryClient}>
          <RealtimeProvider url={socketUrl(API_URL)} onGameStarted={openGame}>
            <Routes />
          </RealtimeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** A game of mine just started (accepted elsewhere, or game 2 of a match): open it. */
function openGame(game: { id: string }) {
  router.push(`/game/${game.id}`);
}

function Routes() {
  const { state, session } = useSession();
  const pathname = usePathname();
  const loading = state.status === 'loading';
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (state.status === 'unreachable') {
    return (
      <View style={styles.app}>
        {Platform.OS === 'web' && <WebTopBar playing={false} />}
        <Screen title="ClawPlay">
          <Notice tone="error">{describeError(state.error)}</Notice>
          <Button title="Try again" onPress={() => void session.retry()} />
        </Screen>
      </View>
    );
  }
  const signedIn = state.status === 'signedIn';
  // An account with something to agree to (its age, or changed terms) sees only that until done.
  const agreeing = signedIn && (state.user.age_needed || state.user.consents_needed.length > 0);
  const playing = signedIn && !agreeing;
  return (
    <View style={styles.app}>
      <StatusBar style={statusBarStyle(pathname)} />
      {Platform.OS === 'web' && <WebTopBar playing={playing} />}
      {playing && <ConnectionBanner />}
      {playing && <ChallengeBanner />}
      <Stack screenOptions={{ headerShown: false, ...APP_BAR }}>
        <Stack.Protected guard={playing} redirectTo={agreeing ? '/agree' : '/welcome'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="player/[username]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="challenge/[username]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="game/[id]" options={{ headerShown: true, title: 'Game' }} />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
          <Stack.Screen
            name="notifications"
            options={{ headerShown: true, title: 'Notifications' }}
          />
          <Stack.Screen name="report/[username]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="play" options={{ headerShown: true, title: 'Play now' }} />
          <Stack.Screen name="plans" options={{ headerShown: true, title: 'Plans' }} />
          <Stack.Screen
            name="appearance"
            options={{ headerShown: true, title: 'Board, pieces and sounds' }}
          />
          <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
          <Stack.Screen name="c/[code]" options={{ headerShown: true, title: 'Challenge' }} />
          <Stack.Screen name="tournaments" options={{ headerShown: true, title: 'Tournaments' }} />
          <Stack.Screen
            name="tournament/[code]"
            options={{ headerShown: true, title: 'Tournament' }}
          />
          <Stack.Screen name="trainer" options={{ headerShown: true, title: 'Trainer' }} />
          <Stack.Screen name="claim" options={{ headerShown: true, title: 'Your account' }} />
          <Stack.Screen
            name="moderation/index"
            options={{ headerShown: true, title: 'Moderation' }}
          />
          <Stack.Screen
            name="moderation/[username]"
            options={{ headerShown: true, title: 'Moderation' }}
          />
        </Stack.Protected>
        <Stack.Protected guard={agreeing} redirectTo="/welcome">
          <Stack.Screen name="agree" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="start" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        {/* Targets of emailed links: they work whether or not someone is signed in. */}
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="confirm-email" />
        <Stack.Screen name="parent-consent" />
        {/* The terms and privacy policy can be read by anyone, from anywhere. */}
        {/* The web's top bar is enough there: the document's own heading names the page. */}
        <Stack.Screen
          name="terms"
          options={{ headerShown: Platform.OS !== 'web', title: 'Terms of service' }}
        />
        <Stack.Screen
          name="privacy"
          options={{ headerShown: Platform.OS !== 'web', title: 'Privacy policy' }}
        />
      </Stack>
    </View>
  );
}

/** Shown instead of a screen that crashed while rendering, with a way to try again. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('Screen crashed', error);
  return (
    <Screen title="Something went wrong">
      <Notice tone="error">This screen ran into a problem. Trying again usually helps.</Notice>
      <Button title="Try again" onPress={() => void retry()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
