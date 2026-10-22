/** The browser's sign-in windows cannot open under Jest: a stand-in (see expo-auth-session). */
export const maybeCompleteAuthSession = jest.fn(() => ({ type: 'failed' }));
export const openAuthSessionAsync = jest.fn(async () => ({ type: 'cancel' }));
