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

const KEY = 'session-token';

export const secureTokenStore: TokenStore = {
  load: () => SecureStore.getItemAsync(KEY),
  save: (token) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

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
