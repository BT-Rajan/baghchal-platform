import { apiUrlProblem } from './apiUrl';

/** The API's address. Public by nature: set EXPO_PUBLIC_API_URL when building. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * The website's address, for the links the apps share (a challenge, a tournament): a friend
 * opens them in a browser. Set EXPO_PUBLIC_WEB_URL when the website is not served from the
 * API's address (as ./runonce.sh does, one address for both).
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? API_URL).replace(/\/+$/, '');

// Never send credentials over an unencrypted connection from a release build.
const problem = apiUrlProblem(
  API_URL,
  !__DEV__,
  process.env.EXPO_PUBLIC_ALLOW_PLAIN_HTTP === 'true',
);
if (problem !== null) throw new Error(problem);
