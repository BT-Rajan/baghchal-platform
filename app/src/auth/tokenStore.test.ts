import * as SecureStore from 'expo-secure-store';

import {
  cookieTokenStore,
  secureTokenStore,
  secureUsernameStore,
  tokenStoreFor,
  transportFor,
  usernameStoreFor,
} from './tokenStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'saved'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

test('apps use bearer tokens in secure storage; the web uses the cookie', () => {
  expect(transportFor('ios')).toBe('bearer');
  expect(transportFor('android')).toBe('bearer');
  expect(transportFor('web')).toBe('cookie');
  expect(transportFor()).toBe('bearer'); // the test environment runs as iOS
  expect(tokenStoreFor('bearer')).toBe(secureTokenStore);
  expect(tokenStoreFor('cookie')).toBe(cookieTokenStore);
  // The last username is kept in the apps only.
  expect(usernameStoreFor('bearer')).toBe(secureUsernameStore);
  expect(usernameStoreFor('cookie')).toBe(cookieTokenStore);
});

test('the last username has a key of its own', async () => {
  await secureUsernameStore.save('alice');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('last-username', 'alice');
});

test('the secure store keeps the token in the Keychain / Keystore', async () => {
  await expect(secureTokenStore.load()).resolves.toBe('saved');
  await secureTokenStore.save('tok');
  await secureTokenStore.clear();
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('session-token');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('session-token', 'tok');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session-token');
});

test('the cookie store keeps nothing', async () => {
  await expect(cookieTokenStore.load()).resolves.toBeNull();
  await expect(cookieTokenStore.save('tok')).resolves.toBeUndefined();
  await expect(cookieTokenStore.clear()).resolves.toBeUndefined();
});
