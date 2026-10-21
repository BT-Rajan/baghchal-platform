/**
 * Where a signed-out person was going (a friend's challenge link, a tournament), kept while
 * they play as a guest, sign in or make an account, so they get there afterwards.
 *
 * Only a path inside the app is kept ("/c/abc123"), never a full address or "//elsewhere", so
 * the remembered place can never send anyone off ClawPlay. On the web it is also kept in the
 * browser for a day, as the email that confirms a new account opens in a new tab.
 */

/** The longest anything is remembered: a challenge link is open for a day. */
export const RETURN_TTL_MS = 24 * 60 * 60 * 1000;

const KEY = 'clawplay-return-to';

/** The screens a signed-out person may be on: nothing to come back to there. */
const PUBLIC =
  /^\/(welcome|start|sign-in|sign-up|forgot-password|verify-email|reset-password|confirm-email|terms|privacy|delete-account|agree)?$/;

interface Saved {
  path: string;
  at: number;
}

let remembered: Saved | null = null;

/** A path inside the app ("/c/abc123"), or null for anything else (a full URL, "//x", "/\\x"). */
export function safePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(raw)) return null;
  return raw;
}

/** Whether `path` is somewhere worth coming back to after signing in. */
export function worthReturning(path: string): boolean {
  return safePath(path) !== null && !PUBLIC.test(path.split('?')[0]!);
}

/** Remember where a signed-out person was going (ignored unless it is a safe in-app path). */
export function rememberReturn(path: string, nowMs: number = Date.now()): void {
  if (!worthReturning(path)) return;
  remembered = { path, at: nowMs };
  storage()?.setItem(KEY, JSON.stringify(remembered));
}

/** Where they were going, if anywhere (and not too long ago), without forgetting it. */
export function peekReturn(nowMs: number = Date.now()): string | null {
  const saved = remembered ?? load();
  if (saved === null || nowMs - saved.at > RETURN_TTL_MS) return null;
  return safePath(saved.path);
}

/** Where they were going, forgetting it: they are on their way. */
export function takeReturn(nowMs: number = Date.now()): string | null {
  const path = peekReturn(nowMs);
  forgetReturn();
  return path;
}

export function forgetReturn(): void {
  remembered = null;
  storage()?.removeItem(KEY);
}

function load(): Saved | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw === null || raw === undefined) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    return typeof saved.path === 'string' && typeof saved.at === 'number'
      ? { path: saved.path, at: saved.at }
      : null;
  } catch {
    return null;
  }
}

/** The browser's storage on the web; none in the apps, or where the browser refuses it. */
function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (store === undefined) return null;
    return {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => {
        try {
          store.setItem(key, value);
        } catch {
          // Full or blocked: the in-memory copy still works in this tab.
        }
      },
      removeItem: (key) => {
        try {
          store.removeItem(key);
        } catch {
          // Blocked: nothing was saved there either.
        }
      },
    };
  } catch {
    return null;
  }
}
