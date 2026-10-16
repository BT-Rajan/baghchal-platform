import type { TokenStore } from '@/auth/tokenStore';

export function memoryTokenStore(initial: string | null = null) {
  let token = initial;
  const store: TokenStore & { current(): string | null } = {
    load: jest.fn(async () => token),
    save: jest.fn(async (value: string) => {
      token = value;
    }),
    clear: jest.fn(async () => {
      token = null;
    }),
    current: () => token,
  };
  return store;
}

/** A promise you resolve later, to hold a fake server's answer. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
