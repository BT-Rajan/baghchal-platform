import { useLocales } from 'expo-localization';
import { createContext, Fragment, useContext, useEffect, type ReactNode } from 'react';
import { I18nManager, Platform } from 'react-native';

import { useAppearanceQuery } from '@/appearance/hooks';
import { useSession } from '@/auth/session';

import { effective, fromDevice, isRTL, setLanguage, type Language } from '.';

/** The device's own language, as far as ClawPlay speaks it. */
export function useDeviceLanguage(): Language {
  const locales = useLocales();
  return fromDevice(locales.map((l) => l.languageTag));
}

const LanguageContext = createContext<Language>('en');

/** The language in use, for what must be drawn again when it changes (layouts' titles). */
export function useLanguage(): Language {
  return useContext(LanguageContext);
}

/**
 * A screen's content, drawn afresh in a new language. Each screen is redrawn inside its own
 * place in the navigation, rather than the whole app at once: rebuilding every navigator and
 * native screen together is what made switching fragile on Android.
 */
export function InLanguage({ children }: { children: ReactNode }) {
  return <Fragment key={useLanguage()}>{children}</Fragment>;
}

/**
 * Speaks the player's language: their appearance's choice (once signed in), else the
 * device's. Screens are drawn again in it (InLanguage, in each navigator's screen layout).
 * Arabic turns the layout right to left: at once on the web, and from the next start in the
 * apps (Android and iOS set the direction as the app opens).
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const signedIn = state.status === 'signedIn';
  const device = useDeviceLanguage();
  const appearance = useAppearanceQuery(signedIn);
  const chosen = signedIn ? appearance.data?.language : undefined;
  const language = effective(chosen, device);
  setLanguage(language); // before anything below is drawn
  const rtl = isRTL();
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return; // drawn ahead of time, with no page
      document.documentElement.lang = language;
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    } else {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
    }
  }, [language, rtl]);
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

/** Whether the apps must be opened again to turn the layout the language's way. */
export function needsRestart(): boolean {
  return Platform.OS !== 'web' && I18nManager.isRTL !== isRTL();
}
