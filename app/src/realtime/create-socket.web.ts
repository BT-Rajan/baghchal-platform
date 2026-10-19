import type { SocketFactory, SocketLike } from './socket';

/** Browsers send the session cookie and their Origin; there is no token to add. */
export const createSocket: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;
