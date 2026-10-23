import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { followAppFocus } from '@/api/focus';
import { t } from '@/i18n';
import { InLanguage, LanguageRoot, useLanguage } from '@/i18n/LanguageRoot';
import { shouldRetry } from '@/api/retry';
import { rememberReturn, takeReturn } from '@/auth/returnTo';
import { SessionProvider, useRememberedUsername, useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { AppBanners, BannersOnScreens } from '@/components/AppBanners';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { SnackbarHost } from '@/components/Snackbar';
import { Loading } from '@/components/States';
import { BrandSplash, SPLASH_FADE_MS } from '@/components/brand/BrandSplash';
import { navigationBarStyle } from '@/components/navigationBar';
import { statusBarStyle } from '@/components/statusBar';
import { WebTopBar } from '@/components/site/WebTopBar';
import { API_URL } from '@/config';
import { openedFromScreen } from '@/game/onScreen';
import { socketUrl } from '@/realtime/connection';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { colors, type } from '@/theme';

// The splash screen (the icon on the brand colour) stays until we know whether someone is signed
// in, so the app opens straight onto the right screen.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * How long the apps' brand splash shows at least, and how long it takes to fade into the first
 * screen (neither in tests, which start at once).
 */
const TESTING = process.env.NODE_ENV === 'test';
const SPLASH_MS = TESTING ? 0 : 1200;
const FADE_MS = TESTING ? 0 : SPLASH_FADE_MS;

/** In the apps, every screen's bar is the brand's dark bar, as Android and iOS apps have. */
const APP_BAR =
  Platform.OS === 'web'
    ? {}
    : {
        headerStyle: { backgroundColor: colors.brandInk },
        headerTintColor: colors.brandCream,
        headerTitleStyle: { color: colors.brandCream },
      };

/** A link opened from outside (a cold start) has Play underneath, so back goes there. */
export const unstable_settings = { anchor: '(tabs)' };

/**
 * Each screen sets the system bars' icons for itself, from whether it shows an app bar: the
 * screen in front was mounted last, so its settings win, and going back restores the last.
 */
function ScreenBars({
  route,
  options,
  children,
}: {
  route: { name: string };
  options: { headerShown?: boolean };
  children: ReactElement;
}) {
  return (
    <>
      <StatusBar style={statusBarStyle(route.name, options.headerShown === true)} />
      {Platform.OS === 'android' && <NavigationBar style={navigationBarStyle(route.name)} />}
      {/* The tabs redraw each of their own screens (their layout does the same). */}
      {route.name === '(tabs)' ? children : <InLanguage>{children}</InLanguage>}
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } }),
  );
  // Clearing also cancels the cache's clean-up timers (the root only unmounts in tests).
  useEffect(() => () => queryClient.clear(), [queryClient]);
  useEffect(followAppFocus, []);
  // The window behind the screens (and Android's navigation bar) in the page colour, dark in
  // dark mode, not the light colour the app was built with.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider baseUrl={API_URL} queryClient={queryClient}>
          <RealtimeProvider url={socketUrl(API_URL)} onGameStarted={openGame}>
            <LanguageRoot>
              <Routes />
            </LanguageRoot>
          </RealtimeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * A game of mine just started (accepted elsewhere, or game 2 of a match): open it. Game 1's
 * screen, when in front, counts down to game 2 and opens it itself.
 */
function openGame(game: Game) {
  if (openedFromScreen(game)) return;
  router.push(`/game/${game.id}`);
}

function Routes() {
  useLanguage(); // the bars' titles below, in a new language
  const { state, session } = useSession();
  const remembered = useRememberedUsername();
  const pathname = usePathname();
  const loading = state.status === 'loading';
  // The apps open on the brand splash (the claw mark and the name) for a moment, which then
  // fades into the first screen, drawn underneath meanwhile; the web goes straight to its page.
  const app = Platform.OS !== 'web';
  const [splashTimeUp, setSplashTimeUp] = useState(!app || SPLASH_MS === 0);
  useEffect(() => {
    if (splashTimeUp) return;
    const timer = setTimeout(() => setSplashTimeUp(true), SPLASH_MS);
    return () => clearTimeout(timer);
  }, [splashTimeUp]);
  const holding = app && (loading || !splashTimeUp);
  const [splashGone, setSplashGone] = useState(!app);
  const hideSplash = useCallback(() => setSplashGone(true), []);
  useEffect(() => {
    if (!app && !loading) void SplashScreen.hideAsync().catch(() => {});
  }, [app, loading]);
  const signedIn = state.status === 'signedIn';
  // An account with changed terms to agree to sees only that until done.
  const agreeing = signedIn && state.user.consents_needed.length > 0;
  const playing = signedIn && !agreeing;
  // Signed out in the apps: a device someone signed in on before opens sign-in with their
  // username; one nobody has, the start screen.
  const signedOutHome = app && remembered !== null ? '/sign-in' : '/welcome';
  // A signed-out person who opened a link (a friend's challenge, a tournament) is sent to the
  // welcome page: remember where they were going (not where they were when signing out)...
  const lastStatus = useRef(state.status);
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = state.status;
    if (state.status === 'signedOut' && before !== 'signedIn') rememberReturn(pathname);
  }, [state.status, pathname]);
  // ...and take them there once they are in (as a guest, signed in, or with a new account), over
  // Play, so back from there goes to Play.
  useEffect(() => {
    if (!playing) return;
    const next = takeReturn();
    // Once the screens for signed-in players are in place, or their guard would send it back.
    if (next !== null) setTimeout(() => router.push(next), 0);
  }, [playing]);
  const unreachable = state.status === 'unreachable';
  // Unreachable: try again by itself once the app is in front again, or the browser is online.
  useEffect(() => {
    if (!unreachable) return;
    const retry = () => void session.retry();
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.addEventListener('online', retry);
      return () => window.removeEventListener('online', retry);
    }
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') retry();
    });
    return () => subscription.remove();
  }, [unreachable, session]);
  return (
    <View style={styles.app}>
      {loading ? (
        // In the apps the splash covers the wait.
        !app && (
          <View style={styles.center}>
            <Loading />
          </View>
        )
      ) : unreachable ? (
        <>
          {Platform.OS === 'web' && <WebTopBar playing={false} />}
          <Screen title={t("Can't reach ClawPlay")}>
            <Notice tone="error">{describeError(state.error)}</Notice>
            <Button title={t('Try again')} onPress={() => void session.retry()} />
          </Screen>
        </>
      ) : (
        <Screens playing={playing} agreeing={agreeing} signedIn={signedIn} home={signedOutHome} />
      )}
      {!splashGone && (
        <BrandSplash
          // The system splash (the icon only) gives way to this one once it is drawn.
          onShown={() => void SplashScreen.hideAsync().catch(() => {})}
          hiding={!holding}
          onHidden={hideSplash}
          fadeMs={FADE_MS}
        />
      )}
    </View>
  );
}

/** The app's screens, behind the guards that say who may see which. */
function Screens({
  playing,
  agreeing,
  signedIn,
  home,
}: {
  playing: boolean;
  agreeing: boolean;
  signedIn: boolean;
  /** Where someone signed out is sent. */
  home: '/sign-in' | '/welcome';
}) {
  // The forms that open over a screen (a challenge, a report, a link to send): a sheet on iOS;
  // on Android a screen with its app bar, whose back arrow closes it, as Android apps do.
  const sheet =
    Platform.OS === 'android' ? { headerShown: true } : ({ presentation: 'modal' } as const);
  return (
    <>
      {Platform.OS === 'web' && <WebTopBar playing={playing} />}
      {/* In the apps each screen shows these under its own header (Screen). */}
      {playing && Platform.OS === 'web' && <AppBanners />}
      <BannersOnScreens.Provider value={playing}>
        <Stack screenOptions={{ headerShown: false, ...APP_BAR }} screenLayout={ScreenBars}>
          <Stack.Protected guard={playing} redirectTo={agreeing ? '/agree' : home}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player/[username]" options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="challenge/[username]" options={sheet} />
            <Stack.Screen name="game/[id]" options={{ headerShown: true, title: t('Game') }} />
            <Stack.Screen name="settings" options={{ headerShown: true, title: t('Settings') }} />
            {/* Titled by the screen (Screen's title goes in the bar). */}
            <Stack.Screen name="settings/[section]" options={{ headerShown: true, title: '' }} />
            <Stack.Screen
              name="ways-to-play"
              options={{ headerShown: true, title: t('Play now') }}
            />
            <Stack.Screen name="friends" options={{ headerShown: true, title: t('Friends') }} />
            <Stack.Screen name="puzzle" options={{ headerShown: true, title: t('Daily puzzle') }} />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: true, title: t('Notifications') }}
            />
            <Stack.Screen name="report/[username]" options={sheet} />
            <Stack.Screen name="play" options={{ headerShown: true, title: t('Play now') }} />
            <Stack.Screen name="plans" options={{ headerShown: true, title: t('Plans') }} />
            <Stack.Screen
              name="appearance"
              options={{ headerShown: true, title: t('Board, pieces and sounds') }}
            />
            <Stack.Screen name="invite" options={sheet} />
            <Stack.Screen name="c/[code]" options={{ headerShown: true, title: t('Challenge') }} />
            <Stack.Screen
              name="tournaments"
              options={{ headerShown: true, title: t('Tournaments') }}
            />
            <Stack.Screen
              name="tournament/[code]"
              options={{ headerShown: true, title: t('Tournament') }}
            />
            <Stack.Screen name="trainer" options={{ headerShown: true, title: t('Trainer') }} />
            <Stack.Screen name="claim" options={{ headerShown: true, title: t('Your account') }} />
            <Stack.Screen
              name="make-it-yours"
              options={{ headerShown: true, title: t('Make it yours') }}
            />
            <Stack.Screen
              name="moderation/index"
              options={{ headerShown: true, title: t('Moderation') }}
            />
            <Stack.Screen
              name="moderation/[username]"
              options={{ headerShown: true, title: t('Moderation') }}
            />
            <Stack.Screen
              name="admin/payments"
              options={{ headerShown: true, title: t('Payments') }}
            />
          </Stack.Protected>
          <Stack.Protected guard={agreeing} redirectTo={home}>
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
          {/* The terms and privacy policy can be read by anyone, from anywhere. */}
          {/* The web's top bar is enough there: the document's own heading names the page. */}
          <Stack.Screen
            name="terms"
            options={{ headerShown: Platform.OS !== 'web', title: t('Terms of service') }}
          />
          <Stack.Screen
            name="privacy"
            options={{ headerShown: Platform.OS !== 'web', title: t('Privacy policy') }}
          />
          {/* The Android app's download, for anyone. */}
          <Stack.Screen
            name="download"
            options={{ headerShown: Platform.OS !== 'web', title: t('ClawPlay for Android') }}
          />
          {/* How to delete an account, for anyone (app stores ask for such a page). */}
          <Stack.Screen
            name="delete-account"
            options={{ headerShown: Platform.OS !== 'web', title: t('Delete your account') }}
          />
        </Stack>
      </BannersOnScreens.Provider>
      {/* Over the screens: short messages that need no answer. */}
      <SnackbarHost />
    </>
  );
}

/** Shown instead of a screen that crashed while rendering, with a way to try again. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('Screen crashed', error);
  return (
    <Screen title={t('Something went wrong')}>
      <Notice tone="error">
        {t('This screen ran into a problem. Trying again usually helps.')}
      </Notice>
      {/* What went wrong, as it is, for a report: the cause otherwise stays on the phone. */}
      <Text style={styles.cause} selectable>
        {error.message}
      </Text>
      <Button title={t('Try again')} onPress={() => void retry()} />
      <Button title={t('Go to Play')} variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  cause: { ...type.caption, color: colors.muted },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
