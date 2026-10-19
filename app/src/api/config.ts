/** Where the API lives. Set EXPO_PUBLIC_API_URL at build time (it is public, never a secret). */
export function apiBaseUrl(raw: string | undefined, production: boolean): string {
  const url = (raw ?? 'http://localhost:8000').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(url)) {
    throw new Error(`EXPO_PUBLIC_API_URL must be an http(s) URL, got "${url}"`);
  }
  // Browsers treat localhost as secure, so local production builds may use plain http.
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
  if (production && !url.startsWith('https://') && !local) {
    throw new Error('EXPO_PUBLIC_API_URL must use https in production builds');
  }
  return url;
}

/** The WebSocket endpoint for an API base URL. */
export function socketUrl(baseUrl: string): string {
  return baseUrl.replace(/^http/, 'ws') + '/api/v1/ws';
}
