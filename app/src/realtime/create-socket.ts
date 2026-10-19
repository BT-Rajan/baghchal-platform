import type { SocketFactory, SocketLike } from './socket';

type NativeWebSocket = new (
  url: string,
  protocols: string[] | undefined,
  options: { headers: Record<string, string> },
) => SocketLike;

/** Apps authenticate the handshake with a bearer header (React Native supports headers). */
export const createSocket: SocketFactory = (url, token) => {
  const Socket = WebSocket as unknown as NativeWebSocket;
  return new Socket(url, undefined, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};
