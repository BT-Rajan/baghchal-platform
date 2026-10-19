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
| client → server | `ping` | — send one at least every 30 s; a silent connection is closed (4410) |
| server → client | `pong` | — |
| server → client | `probe` | `id` — reply at once with the same message (`{"type": "probe", "id": …}`); the round trip sets the player's [lag allowance](rules.md#live-play-platform-rules). Sent on connect and every 25 s |
| client → server | `probe` | `id` — the echo; ids that do not match the latest probe are ignored |
| server → client | `challenge` | `challenge: {...}` — a challenge involving you was created or changed (any status); match on `challenge.id` |
| server → client | `game` | `game: {...}` — a game you play in started or changed: the full state (position, legal moves, clocks, result); match on `game.id` and keep the highest `game.ply` |
| server → client | `friends` | (no fields) — your friends or friend requests changed; fetch `GET /friends` again |
| server → client | `notification` | (no fields) — a new notification; fetch `GET /notifications` again |
| server → client | `error` | `code`, `message` — e.g. `invalid_message`; the socket stays open |

Commands (challenges, moves, resigning) go over HTTP; the socket carries the resulting
events, to every tab and device of both players.

Clocks in a `game` event are as of its `server_time`; `clocks.running` names the side whose
clock is counting down. Count down locally from there, but the server decides: a move that
arrives after the deadline is refused, and the game ends on time even if nobody moves.

## Limits and close codes
| Code | Meaning |
|---|---|
| 1003 | Binary frame (only JSON text is accepted) |
| 1009 | Message over 4 KB |
| 4401 | Session ended (signed out, password changed or reset, account deleted or suspended) — checked every minute |
| 4408 | Client stopped reading; more than 64 events queued |
| 4410 | Client went silent: nothing received for 90 s (a phone app suspended in the background) |
| 4429 | More than 10 messages per second (burst 20) |

## How it scales
- **Presence**: each connection refreshes a Redis entry every 15 s; entries lapse after 45 s,
  so users of a crashed server stop showing as online within 45 s. A user is online while any
  of their connections is. Each user's last-seen time is kept too (for abandonment claims).
- **Apps in the background** close their connection, so they stop showing as online straight
  away, and reconnect when they return to the foreground (catching up on what they missed).
- **Delivery**: events are published to a per-user Redis channel; each server subscribes to
  the channels of users connected to it. Any server can notify any user. Measured: with
  opponents on different servers, a move reaches the other player's socket in 330 ms at the
  95th percentile under heavy load ([operations](operations.md#scaling)).
- **Ending games on time**: one server at a time holds a 3-second lease in Redis and sweeps for
  games out of time; if it stops, another takes over within the lease. The database update
  that ends a game is conditional, so a game is ended exactly once even if two servers overlap.
- Without Redis (development), presence and delivery are in-process.
