import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/auth/session';
import { Body, Button, Loading, Screen, Title } from '@/components/ui';
import { createSocket } from '@/realtime/create-socket';
import { RealtimeProvider } from '@/realtime/provider';
import { api, queryClient, tokenStore } from '@/services';
import { usePalette } from '@/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider api={api} store={tokenStore} onSignedOut={() => queryClient.clear()}>
          <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
            <StatusBar style="auto" />
            <RootNavigator />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { state, retry, expire } = useSession();
  const palette = usePalette();
  const openGame = useCallback((id: string) => router.navigate(`/game/${id}`), []);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'unreachable') {
    return (
      <Screen>
        <Title>Bagh Chal</Title>
        <Body>Cannot reach the server. Check your connection and try again.</Body>
        <Button label="Try again" onPress={retry} />
      </Screen>
    );
  }

  const signedIn = state.status === 'signed-in';
  const stack = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.text,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="game/[id]" options={{ title: 'Game' }} />
        <Stack.Screen name="player/[username]" options={{ title: 'Player' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Forgot password' }} />
      </Stack.Protected>
      <Stack.Screen name="verify-email" options={{ title: 'Verify email' }} />
      <Stack.Screen name="reset-password" options={{ title: 'New password' }} />
    </Stack>
  );
  // The provider is always mounted, so signing in does not remount the screens below it.
  return (
    <RealtimeProvider
      api={api}
      me={signedIn ? state.user.id : null}
      createSocket={createSocket}
      onGameStarted={openGame}
      onSessionEnded={expire}
    >
      {stack}
    </RealtimeProvider>
  );
}
