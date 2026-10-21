/**
 * expo-audio's native module does not load under Jest, so tests get this stand-in (Jest uses a
 * mock beside node_modules for every test without being told). Tests can inspect the calls.
 */
export const setAudioModeAsync = jest.fn(async () => {});
export const createAudioPlayer = jest.fn(() => ({
  play: jest.fn(),
  seekTo: jest.fn(async () => {}),
}));
