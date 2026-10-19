/** Mirrors the server's rules (accounts/schemas.py) so forms can explain problems early. */
export const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/;
export const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;
