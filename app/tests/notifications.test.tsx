import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Notification, NotificationList } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { BOB } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };

const note = (overrides: Partial<Notification>): Notification => ({
  id: 'n1',
  kind: 'challenge',
  actor: BOB,
  detail: '5+3 rated',
  tournament: null,
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  read: false,
  ...overrides,
});

describe('notifications', () => {
  test('the bell counts them; opening the list reads them and leads on', async () => {
    let list: NotificationList = {
      unread: 2,
      items: [
        note({ created_at: new Date().toISOString() }),
        note({
          id: 'n2',
          kind: 'tournament_started',
          detail: null,
          tournament: { code: 'cup1', name: 'Friday cup' },
          read: true,
        }),
      ],
    };
    const { app, server } = await renderApp('/', {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'GET /api/v1/notifications': () => ({ status: 200, body: list }),
        'POST /api/v1/notifications/read': () => {
          list = { unread: 0, items: list.items.map((n) => ({ ...n, read: true })) };
          return { status: 204 };
        },
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    await waitFor(() => expect(app.getPathname()).toBe('/notifications'));
    expect(await screen.findByText('bob challenged you to a 5+3 rated game.')).toBeOnTheScreen();
    expect(screen.getByText('Friday cup has started: your games are ready.')).toBeOnTheScreen();
    expect(screen.getByText('just now')).toBeOnTheScreen();
    expect(screen.getByText('5 min ago')).toBeOnTheScreen();
    await waitFor(() => expect(server.lastTo('POST /api/v1/notifications/read')).toBeDefined());
    // Read now, but what was new when the list opened stays marked new for this visit.
    await waitFor(() =>
      expect(
        server.requests.filter((r) => r.path === '/api/v1/notifications').length,
      ).toBeGreaterThan(1),
    );
    expect(screen.getByText('bob challenged you to a 5+3 rated game.')).toHaveStyle({
      fontWeight: '700',
    });
    expect(screen.getByText('Friday cup has started: your games are ready.')).not.toHaveStyle({
      fontWeight: '700',
    });
    // A challenge still open leads to the lobby, where it is answered; each says when.
    await fireEvent.press(
      screen.getByRole('link', { name: 'bob challenged you to a 5+3 rated game. (just now)' }),
    );
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });

  test('an expired challenge leads nowhere', async () => {
    await renderApp('/notifications', {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'GET /api/v1/notifications': { status: 200, body: { unread: 0, items: [note({})] } },
      },
    });
    expect(await screen.findByText('bob challenged you to a 5+3 rated game.')).toBeOnTheScreen();
    expect(
      screen.queryByRole('link', { name: /^bob challenged you to a 5\+3 rated game\./ }),
    ).toBeNull();
  });

  test('a new one arrives live; an empty list says what will show', async () => {
    let list: NotificationList = { unread: 0, items: [] };
    await renderApp('/', {
      token: 'tok',
      routes: { ...SIGNED_IN, 'GET /api/v1/notifications': () => ({ status: 200, body: list }) },
    });
    await screen.findByRole('button', { name: 'Notifications' });
    list = { unread: 1, items: [note({ kind: 'friend_request', detail: null })] };
    await act(() => {
      FakeSocket.latest().open();
      FakeSocket.latest().receive({ type: 'notification' });
    });
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeOnTheScreen();
  });

  test('nothing yet, and a failed load', async () => {
    let fail = true;
    await renderApp('/notifications', {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'GET /api/v1/notifications': () =>
          fail
            ? error(400, 'bad', 'Notifications are down.')
            : { status: 200, body: { unread: 0, items: [] } },
      },
    });
    expect(await screen.findByText('Notifications are down.')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/^Nothing yet\./)).toBeOnTheScreen();
  });
});
