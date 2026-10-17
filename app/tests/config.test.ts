/** src/config.ts refuses to start a release build that would send credentials over plain http. */
declare const global: { __DEV__: boolean };

function loadConfig(url: string | undefined, dev: boolean) {
  const saved = { url: process.env.EXPO_PUBLIC_API_URL, dev: global.__DEV__ };
  if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = url;
  global.__DEV__ = dev;
  try {
    let config: { API_URL: string } | undefined;
    jest.isolateModules(() => {
      config = jest.requireActual('@/config');
    });
    return config?.API_URL;
  } finally {
    if (saved.url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = saved.url;
    global.__DEV__ = saved.dev;
  }
}

test('release builds need https', () => {
  expect(loadConfig('https://api.example.com', false)).toBe('https://api.example.com');
  expect(() => loadConfig('http://api.example.com', false)).toThrow(/must use https/);
});

test('development allows plain http, and defaults to the local server', () => {
  expect(loadConfig('http://192.168.1.20:8000', true)).toBe('http://192.168.1.20:8000');
  expect(loadConfig(undefined, false)).toBe('http://localhost:8000');
});
