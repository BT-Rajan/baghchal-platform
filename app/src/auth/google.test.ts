import { builtInClientIds, clientIdFor, googleClientId } from './google';

const SERVER_IDS = { web: 'web-srv', android: 'android-srv', ios: 'ios-srv' };

test("each platform uses its own client, and a blank one counts as none", () => {
  const ids = { web: 'w', android: ' a ', ios: '' };
  expect(clientIdFor('web', ids)).toBe('w');
  expect(clientIdFor('android', ids)).toBe('a');
  expect(clientIdFor('ios', ids)).toBeNull();
  expect(clientIdFor('windows', ids)).toBeNull();
  expect(clientIdFor('web', null)).toBeNull();
});

test("the build's ids come first, then the server's when it says Google is on", () => {
  expect(googleClientId('android', { android: 'own' }, { google: true, google_client_ids: SERVER_IDS })).toBe('own');
  expect(googleClientId('android', {}, { google: true, google_client_ids: SERVER_IDS })).toBe('android-srv');
  expect(googleClientId('android', {}, { google: false, google_client_ids: SERVER_IDS })).toBeNull();
  expect(googleClientId('android', {}, { google: true, google_client_ids: null })).toBeNull();
  expect(googleClientId('ios', {}, undefined)).toBeNull();
});

test("the build's ids are read from its environment", () => {
  const before = { ...process.env };
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'w';
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'a';
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  expect(builtInClientIds()).toEqual({ web: 'w', android: 'a', ios: undefined });
  process.env = before;
});
