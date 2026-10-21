import {
  RETURN_TTL_MS,
  forgetReturn,
  peekReturn,
  rememberReturn,
  safePath,
  takeReturn,
  worthReturning,
} from './returnTo';

afterEach(() => {
  forgetReturn();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** A browser's storage, in memory. */
function fakeStorage() {
  const items = new Map<string, string>();
  const store = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  (globalThis as { localStorage?: unknown }).localStorage = store;
  return { items, store };
}

test('only paths inside the app are kept', () => {
  expect(safePath('/c/abc123')).toBe('/c/abc123');
  expect(safePath('/tournament/cup1?tab=standings')).toBe('/tournament/cup1?tab=standings');
  expect(safePath('https://evil.example/c/abc')).toBeNull();
  expect(safePath('//evil.example')).toBeNull();
  expect(safePath('/\\evil.example')).toBeNull();
  expect(safePath('c/abc')).toBeNull();
  expect(safePath('/c/<script>')).toBeNull();
  expect(safePath('/' + 'a'.repeat(200))).toBeNull();
  expect(safePath(42)).toBeNull();
  expect(worthReturning('/c/abc')).toBe(true);
  for (const path of ['/', '/welcome', '/start', '/sign-in', '/sign-up?x=1', '/verify-email']) {
    expect(worthReturning(path)).toBe(false);
  }
  expect(worthReturning('//x')).toBe(false);
});

test('remembers where someone was going, once, for a day', () => {
  expect(peekReturn()).toBeNull();
  rememberReturn('/welcome');
  rememberReturn('https://evil.example');
  expect(peekReturn()).toBeNull();
  rememberReturn('/c/abc', 1_000);
  expect(peekReturn(2_000)).toBe('/c/abc');
  expect(peekReturn(1_000 + RETURN_TTL_MS + 1)).toBeNull();
  expect(takeReturn(2_000)).toBe('/c/abc');
  expect(takeReturn(2_000)).toBeNull();
});

test('on the web it lasts across tabs (the confirmation email opens a new one)', () => {
  const { items } = fakeStorage();
  rememberReturn('/c/abc', 1_000);
  expect(JSON.parse(items.get('clawplay-return-to')!)).toEqual({ path: '/c/abc', at: 1_000 });
  // A new tab: nothing in memory, the browser still has it.
  jest.isolateModules(() => {
    const fresh = jest.requireActual<typeof import('./returnTo')>('./returnTo');
    expect(fresh.takeReturn(2_000)).toBe('/c/abc');
    expect(items.has('clawplay-return-to')).toBe(false);
  });
});

test('nothing usable in the browser is nothing', () => {
  const { items } = fakeStorage();
  const fresh = () => {
    let found: string | null = 'unset';
    jest.isolateModules(() => {
      found = jest.requireActual<typeof import('./returnTo')>('./returnTo').peekReturn(1);
    });
    return found;
  };
  items.set('clawplay-return-to', 'not json');
  expect(fresh()).toBeNull();
  items.set('clawplay-return-to', JSON.stringify({ path: 5 }));
  expect(fresh()).toBeNull();
  items.set('clawplay-return-to', JSON.stringify({ path: '//evil', at: 0 }));
  expect(fresh()).toBeNull();
});

test('a browser that refuses its storage still works in the tab', () => {
  const { store } = fakeStorage();
  store.setItem = () => {
    throw new Error('quota');
  };
  store.removeItem = () => {
    throw new Error('blocked');
  };
  rememberReturn('/c/abc');
  expect(peekReturn()).toBe('/c/abc');
  expect(takeReturn()).toBe('/c/abc');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('denied');
    },
  });
  rememberReturn('/c/abc');
  expect(takeReturn()).toBe('/c/abc');
});
