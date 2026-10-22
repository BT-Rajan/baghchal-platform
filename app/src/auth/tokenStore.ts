/**
 * Where the session token lives between launches.
 * Apps keep it in the Keychain / Keystore. On the web the session is an HttpOnly cookie that
 * scripts cannot read, so there is nothing to store.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Transport } from '@/api/client';

export interface TokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** A short text kept in the Keychain / Keystore under `key`. */
function secureItem(key: string): TokenStore {
  return {
    load: () => SecureStore.getItemAsync(key),
    save: (value) => SecureStore.setItemAsync(key, value),
    clear: () => SecureStore.deleteItemAsync(key),
  };
}

export const secureTokenStore = secureItem('session-token');

/**
 * The username last signed in (or up) on this device, so sign-in opens with it filled in. Kept
 * after signing out (that is its point); forgotten with "Not you?" and when the account is
 * deleted. Apps only: the web's front page is the same for everyone.
 */
export const secureUsernameStore = secureItem('last-username');

export const cookieTokenStore: TokenStore = {
  load: async () => null,
  save: async () => {},
  clear: async () => {},
};

export function transportFor(os: string = Platform.OS): Transport {
  return os === 'web' ? 'cookie' : 'bearer';
}

export function tokenStoreFor(transport: Transport): TokenStore {
  return transport === 'cookie' ? cookieTokenStore : secureTokenStore;
}

/** Where the last username lives: nowhere on the web (see `secureUsernameStore`). */
export function usernameStoreFor(transport: Transport): TokenStore {
  return transport === 'cookie' ? cookieTokenStore : secureUsernameStore;
}
