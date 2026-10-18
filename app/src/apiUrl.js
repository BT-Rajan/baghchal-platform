// @ts-check
/**
 * The API's address must be safe to send passwords and session tokens to. Production builds
 * accept only https (and plain http to this machine, for local testing); development also
 * allows plain http, so a phone can reach a server on the developer's network.
 *
 * A build for a private network without https (see runonce.sh) can opt out of this check with
 * EXPO_PUBLIC_ALLOW_PLAIN_HTTP=true; passwords then cross that network unencrypted.
 *
 * Used by app.config.ts (the build fails) and by src/config.ts (the app refuses to start).
 * Plain JavaScript (CommonJS) because Expo's config loader cannot load TypeScript modules.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why `url` is not acceptable, or null if it is.
 * @param {string} url
 * @param {boolean} production
 * @param {boolean} [allowPlainHttp] the explicit opt-out described above
 * @returns {string | null}
 */
function apiUrlProblem(url, production, allowPlainHttp = false) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `EXPO_PUBLIC_API_URL is not a URL: ${url}`;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return 'EXPO_PUBLIC_API_URL must not contain credentials';
  }
  if (parsed.protocol === 'https:') return null;
  if (parsed.protocol !== 'http:') return `EXPO_PUBLIC_API_URL must use https: ${url}`;
  if (!production || allowPlainHttp || LOOPBACK.has(parsed.hostname)) return null;
  return `EXPO_PUBLIC_API_URL must use https in production builds: ${url}`;
}

module.exports = { apiUrlProblem };
