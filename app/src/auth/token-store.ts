import * as SecureStore from 'expo-secure-store';

/** Where an app keeps its session token between launches. */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'baghchal.session';

/** Keychain (iOS) / Keystore (Android), readable only by this app, never backed up. */
export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

/** Browsers keep the session in an HttpOnly cookie that scripts cannot read: nothing to store. */
export const cookieTokenStore: TokenStore = {
  get: async () => null,
  set: async () => undefined,
  clear: async () => undefined,
};
