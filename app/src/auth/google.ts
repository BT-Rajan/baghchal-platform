/**
 * Which Google client signs in on this platform, if Google sign-in is set up at all. The ids
 * are public (they name the app to Google): the build's EXPO_PUBLIC_GOOGLE_*_CLIENT_ID first,
 * else what the server's `GET /auth/providers` says.
 */
import type { AuthProviders } from '@/api/endpoints';

export interface GoogleClientIds {
  web?: string | null | undefined;
  android?: string | null | undefined;
  ios?: string | null | undefined;
}

/** The build's own ids (read by name, so the bundler can put them in). */
export function builtInClientIds(): GoogleClientIds {
  return {
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  };
}

function platformKey(os: string): keyof GoogleClientIds | null {
  return os === 'web' || os === 'android' || os === 'ios' ? os : null;
}

/** This platform's client id from a set of ids, or null (not set, or blank). */
export function clientIdFor(os: string, ids: GoogleClientIds | null | undefined): string | null {
  const key = platformKey(os);
  const id = key === null ? undefined : ids?.[key];
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
}

/**
 * The client id Google sign-in uses here: the build's, else the server's (only when the server
 * says Google is on). Null: no Google button.
 */
export function googleClientId(
  os: string,
  builtIn: GoogleClientIds,
  providers: AuthProviders | undefined,
): string | null {
  const own = clientIdFor(os, builtIn);
  if (own !== null) return own;
  if (providers?.google !== true) return null;
  return clientIdFor(os, providers.google_client_ids);
}
