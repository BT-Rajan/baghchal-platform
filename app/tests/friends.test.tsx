import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { FriendRelation, Friends } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { BOB } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const NONE: Friends = { friends: [], incoming: [], outgoing: [] };

const profile = (friend: FriendRelation) => ({
  ...BOB,
  online: true,
  playing: false,
  blocked: false,
  created_at: '2026-03-02T10:00:00Z',
  ratings: {},
  friend,
});

function open(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(await screen.findByRole('button', { name }));
}

describe('friends', () => {
  test('ask from a profile, then cancel', async () => {
    let relation: FriendRelation = 'none';
    const { server } = await open('/player/bob', {
      'GET /api/v1/players/bob': () => ({ status: 200, body: profile(relation) }),
      'POST /api/v1/friends/bob': () => {
        relation = 'requested';
        return { status: 200, body: { relation } };
      },
      'DELETE /api/v1/friends/bob': () => {
        relation = 'none';
        return { status: 204 };
      },
    });
    await press('Add bob as a friend');
    expect(await screen.findByText('Friend request sent.')).toBeOnTheScreen();
    await press('Cancel the friend request to bob');
    expect(await screen.findByRole('button', { name: 'Add bob as a friend' })).toBeOnTheScreen();
    expect(server.lastTo('DELETE /api/v1/friends/bob')).toBeDefined();
  });

  test('answer a request on home; friends are listed to challenge', async () => {
    let lists: Friends = { ...NONE, incoming: [BOB] };
    await open('/', {
      'GET /api/v1/friends': () => ({ status: 200, body: lists }),
      'POST /api/v1/friends/bob': () => {
        lists = { ...NONE, friends: [{ ...BOB, online: true, playing: false }] };
        return { status: 200, body: { relation: 'friends' } };
      },
    });
    expect(await screen.findByText('bob wants to be friends.')).toBeOnTheScreen();
    await press("Accept bob's friend request");
    expect(await screen.findByRole('heading', { name: 'Friends' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Challenge bob' })).toBeEnabled();
    expect(screen.queryByText('bob wants to be friends.')).toBeNull();
  });

  test('decline a request; a refusal is shown', async () => {
    const { server } = await open('/', {
      'GET /api/v1/friends': { status: 200, body: { ...NONE, incoming: [BOB] } },
      'DELETE /api/v1/friends/bob': error(503, 'unavailable', 'Try again later.'),
    });
    await press("Decline bob's friend request");
    expect(await screen.findByText('Try again later.')).toBeOnTheScreen();
    expect(server.lastTo('DELETE /api/v1/friends/bob')).toBeDefined();
  });

  test('accept from the profile, and unfriend after confirming', async () => {
    let relation: FriendRelation = 'incoming';
    await open('/player/bob', {
      'GET /api/v1/players/bob': () => ({ status: 200, body: profile(relation) }),
      'POST /api/v1/friends/bob': () => {
        relation = 'friends';
        return { status: 200, body: { relation } };
      },
      'DELETE /api/v1/friends/bob': () => {
        relation = 'none';
        return { status: 204 };
      },
    });
    expect(await screen.findByText('bob wants to be friends.')).toBeOnTheScreen();
    await press("Accept bob's friend request");
    expect(await screen.findByText('You and bob are friends.')).toBeOnTheScreen();
    await press('Remove bob from your friends');
    expect(screen.getByText('Remove bob from your friends?')).toBeOnTheScreen();
    await press('Cancel');
    await press('Remove bob from your friends');
    await press('Yes, remove bob');
    expect(await screen.findByRole('button', { name: 'Add bob as a friend' })).toBeOnTheScreen();
  });

  test('news of a friend request arrives live', async () => {
    let lists: Friends = NONE;
    await open('/', { 'GET /api/v1/friends': () => ({ status: 200, body: lists }) });
    await screen.findByText('Ready for a game?');
    lists = { ...NONE, incoming: [BOB] };
    await act(() => {
      FakeSocket.latest().open();
      FakeSocket.latest().receive({ type: 'friends' });
    });
    await waitFor(() => expect(screen.getByText('bob wants to be friends.')).toBeOnTheScreen());
  });

  test('guests are not offered friends', async () => {
    await open('/player/bob', {
      'GET /api/v1/me': { status: 200, body: { ...ME, username: 'guest-3fa9c1', role: 'guest' } },
      'GET /api/v1/players/bob': { status: 200, body: profile('none') },
    });
    expect(await screen.findByRole('button', { name: 'Challenge bob' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add bob as a friend' })).toBeNull();
  });
});
