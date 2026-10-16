# Real-time connection (WebSocket)

One WebSocket per open app or browser tab: `GET /api/v1/ws` (upgrade).

## Connecting
- **Apps** send `Authorization: Bearer <token>` on the handshake.
- **Browsers** rely on the session cookie; the handshake must carry an allowed `Origin`
  (browsers always send it). A cross-site page cannot open a socket with a visitor's cookie.
- A refused handshake gets HTTP 403. Check `GET /api/v1/me` to see whether to sign in again.

## Messages
Every message is a JSON text frame with a `type`.

| Direction | `type` | Body |
|---|---|---|
| server → client | `hello` | `user: {id, username}` — sent once, on connect |
| client → server | `ping` | — |
| server → client | `pong` | — |
| server → client | `challenge` | `challenge: {...}` — a challenge involving you was created or changed (any status); match on `challenge.id` |
| server → client | `error` | `code`, `message` — e.g. `invalid_message`; the socket stays open |

Commands (creating or answering challenges) go over HTTP; the socket carries the resulting
events, to every tab and device of both players.

## Limits and close codes
| Code | Meaning |
|---|---|
| 1003 | Binary frame (only JSON text is accepted) |
| 1009 | Message over 4 KB |
| 4401 | Session ended (signed out, password reset, account disabled) — checked every minute |
| 4408 | Client stopped reading; more than 64 events queued |
| 4429 | More than 10 messages per second (burst 20) |

## How it scales
- **Presence**: each connection refreshes a Redis entry every 15 s; entries lapse after 45 s,
  so users of a crashed server stop showing as online within 45 s. A user is online while any
  of their connections is.
- **Delivery**: events are published to a per-user Redis channel; each server subscribes to
  the channels of users connected to it. Any server can notify any user.
- Without Redis (development), presence and delivery are in-process.
