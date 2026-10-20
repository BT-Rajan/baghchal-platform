import { challenge, game } from '../../tests/support/games';

import { PING, parseServerMessage, probeReply } from './protocol';

const text = (value: unknown) => JSON.stringify(value);

test('ping is the only message clients send', () => {
  expect(JSON.parse(PING)).toEqual({ type: 'ping' });
});

test('parses every server message', () => {
  const user = { id: 'u1', username: 'alice' };
  expect(parseServerMessage(text({ type: 'hello', user }))).toEqual({ type: 'hello', user });
  expect(parseServerMessage(text({ type: 'pong' }))).toEqual({ type: 'pong' });
  expect(parseServerMessage(text({ type: 'probe', id: 7 }))).toEqual({ type: 'probe', id: 7 });
  expect(JSON.parse(probeReply(7))).toEqual({ type: 'probe', id: 7 });
  const c = challenge();
  expect(parseServerMessage(text({ type: 'challenge', challenge: c }))).toEqual({
    type: 'challenge',
    challenge: c,
  });
  // A challenge by link has no opponent until someone accepts it.
  const byLink = challenge({ opponent: null, code: 'abc123' });
  expect(parseServerMessage(text({ type: 'challenge', challenge: byLink }))).toEqual({
    type: 'challenge',
    challenge: byLink,
  });
  expect(parseServerMessage(text({ type: 'friends' }))).toEqual({ type: 'friends' });
  expect(parseServerMessage(text({ type: 'notification' }))).toEqual({ type: 'notification' });
  const emote = { type: 'emote', game_id: 'g1', side: 'tiger', emote: 'oops' };
  expect(parseServerMessage(text(emote))).toEqual(emote);
  const g = game();
  expect(parseServerMessage(text({ type: 'game', game: g }))).toEqual({ type: 'game', game: g });
  expect(
    parseServerMessage(text({ type: 'error', code: 'invalid_message', message: 'm' })),
  ).toEqual({ type: 'error', code: 'invalid_message', message: 'm' });
});

test.each([
  ['not a string', 42],
  ['binary', new ArrayBuffer(2)],
  ['malformed JSON', '{"type":'],
  ['a JSON array', '[]'],
  ['JSON null', 'null'],
  ['no type', text({ user: {} })],
  ['an unknown type', text({ type: 'surprise' })],
  ['hello without a user id', text({ type: 'hello', user: { username: 'x' } })],
  ['hello with a list', text({ type: 'hello', user: [] })],
  [
    'a challenge without status',
    text({ type: 'challenge', challenge: { ...challenge(), status: 1 } }),
  ],
  [
    'a challenge with a broken opponent',
    text({ type: 'challenge', challenge: { ...challenge(), opponent: {} } }),
  ],
  [
    'a challenge without challenger',
    text({ type: 'challenge', challenge: { ...challenge(), challenger: {} } }),
  ],
  ['a challenge that is not one', text({ type: 'challenge', challenge: 'c1' })],
  ['an emote without a game', text({ type: 'emote', side: 'goat', emote: 'oops' })],
  ['an emote from nobody', text({ type: 'emote', game_id: 'g1', side: 'x', emote: 'oops' })],
  ['an emote that is not one', text({ type: 'emote', game_id: 'g1', side: 'goat', emote: 1 })],
  ['a game without ply', text({ type: 'game', game: { ...game(), ply: '3' } })],
  ['a game without status', text({ type: 'game', game: { ...game(), status: null } })],
  ['a game without server_time', text({ type: 'game', game: { ...game(), server_time: 1 } })],
  ['a game without id', text({ type: 'game', game: { ...game(), id: 7 } })],
  ['an error without a message', text({ type: 'error', code: 'x' })],
  ['a probe without an id', text({ type: 'probe' })],
  ['a probe with a negative id', text({ type: 'probe', id: -1 })],
  ['a probe with a fractional id', text({ type: 'probe', id: 1.5 })],
  ['an error without a code', text({ type: 'error', message: 'x' })],
])('ignores %s', (_name, data) => {
  expect(parseServerMessage(data)).toBeNull();
});

test('chat messages are read, and malformed ones dropped', () => {
  const chat = { type: 'chat', game_id: 'g1', side: 'goat', text: 'hi', sent_at: 'x' };
  expect(parseServerMessage(text(chat))).toEqual(chat);
  expect(parseServerMessage(text({ ...chat, side: 'x' }))).toBeNull();
  expect(parseServerMessage(text({ ...chat, text: 1 }))).toBeNull();
  expect(parseServerMessage(text({ ...chat, sent_at: undefined }))).toBeNull();
  expect(parseServerMessage(text({ ...chat, game_id: undefined }))).toBeNull();
});
