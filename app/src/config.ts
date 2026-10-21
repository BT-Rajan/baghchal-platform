import { apiUrlProblem } from './apiUrl';

/** The API's address. Public by nature: set EXPO_PUBLIC_API_URL when building. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// Never send credentials over an unencrypted connection from a release build.
const problem = apiUrlProblem(
  API_URL,
  !__DEV__,
  process.env.EXPO_PUBLIC_ALLOW_PLAIN_HTTP === 'true',
);
if (problem !== null) throw new Error(problem);
