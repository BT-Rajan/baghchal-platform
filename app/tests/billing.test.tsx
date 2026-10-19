import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB } from './support/games';
import { FREE, PLUS_UNTIL } from './support/plans';

import type { Grant, PlayerPlan } from '@/api/endpoints';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const ADMIN = { 'GET /api/v1/me': { status: 200, body: { ...ME, role: 'admin' } } };

function open(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

describe('plans', () => {
  test('the Me tab shows my plan and leads to the plans', async () => {
    const { app } = await open('/me', {
      'GET /api/v1/players/alice': {
        status: 200,
        body: { ...ME, online: true, playing: false, blocked: false, ratings: {} },
      },
      'GET /api/v1/blocks': { status: 200, body: [] },
    });
    expect(await screen.findByText('You are on the Free plan.')).toBeOnTheScreen();
    await press('See Plus and Pro');
    await waitFor(() => expect(app.getPathname()).toBe('/plans'));
    expect(await screen.findByRole('heading', { name: 'Plus' })).toBeOnTheScreen();
    expect(screen.getByText('₹149 a month · ₹1,490 a year')).toBeOnTheScreen();
    expect(screen.getAllByText('✓ Play the Hard computer')).toHaveLength(1);
    expect(screen.getByText('Everything in Plus, and:')).toBeOnTheScreen();
    expect(screen.getByText('✓ Opening and endgame trainer')).toBeOnTheScreen();
    expect(screen.getByText('Game analysis: 5 a day')).toBeOnTheScreen();
    expect(screen.getByLabelText('Free, your plan')).toBeOnTheScreen();
  });

  test('a member sees their plan and when it ends', async () => {
    await open('/plans', { 'GET /api/v1/me/plan': { status: 200, body: PLUS_UNTIL } });
    expect(await screen.findByText('You have ClawPlay Plus until 1 Feb 2026.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Plus, your plan')).toBeOnTheScreen();
  });

  test('a failure can be retried', async () => {
    let fail = true;
    await open('/plans', {
      'GET /api/v1/plans': () =>
        fail ? error(400, 'bad', 'Something broke.') : { status: 200, body: [] },
    });
    expect(await screen.findByText('Something broke.')).toBeOnTheScreen();
    fail = false;
    await press('Try again');
    expect(await screen.findByText('You are on the Free plan.')).toBeOnTheScreen();
  });

  test('Hard asks for Plus, and the history says how far back it goes', async () => {
    const { app } = await open('/play');
    await fireEvent.press(await screen.findByRole('radio', { name: 'Hard' }));
    expect(screen.getByText('Play the Hard computer, the strongest opponent.')).toBeOnTheScreen();
    expect(await screen.findByLabelText('ClawPlay Plus')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play the computer' })).toBeDisabled();
    await press('Get ClawPlay Plus');
    await waitFor(() => expect(app.getPathname()).toBe('/plans'));
  });

  test("a profile's history says how far back it goes on Free", async () => {
    await open('/player/bob', {
      'GET /api/v1/players/bob': {
        status: 200,
        body: {
          ...BOB,
          online: true,
          playing: false,
          blocked: false,
          created_at: ME.created_at,
          ratings: {},
        },
      },
    });
    expect(
      await screen.findByText('Your history shows games from the last 30 days. Keep every game.'),
    ).toBeOnTheScreen();
  });
});

describe('admins', () => {
  const grant = (overrides: Partial<Grant> = {}): Grant => ({
    id: 'gr1',
    plan: 'plus',
    feature: null,
    starts_at: '2026-01-01T12:00:00Z',
    ends_at: '2026-01-31T12:00:00Z',
    reason: 'Welcome gift',
    granted_by: 'alice',
    created_at: '2026-01-01T12:00:00Z',
    revoked_at: null,
    active: true,
    paid: false,
    ...overrides,
  });
  const bobPlan = (history: Grant[]): PlayerPlan => ({
    ...(history.some((g) => g.active) ? PLUS_UNTIL : FREE),
    username: 'bob',
    history,
  });
  const RECORD = {
    status: 200,
    body: {
      ...BOB,
      created_at: ME.created_at,
      role: 'player',
      deleted: false,
      suspended_until: null,
      banned: false,
      suspension_reason: null,
      reports: [],
      actions: [],
    },
  };

  test('grant a plan or a feature, and revoke it', async () => {
    let history: Grant[] = [];
    const { server } = await renderApp('/moderation/bob', {
      token: 'tok',
      routes: {
        ...ADMIN,
        'GET /api/v1/mod/players/bob': RECORD,
        'GET /api/v1/admin/players/bob/plan': () => ({ status: 200, body: bobPlan(history) }),
        'POST /api/v1/admin/players/bob/grants': () => {
          history = [grant()];
          return { status: 201, body: history[0] };
        },
        'POST /api/v1/admin/grants/gr1/revoke': () => {
          history = [grant({ active: false, revoked_at: '2026-01-02T12:00:00Z' })];
          return { status: 200, body: history[0] };
        },
      },
    });
    expect(await screen.findByText('bob is on the Free plan.')).toBeOnTheScreen();
    expect(screen.getByText('Nothing granted yet.')).toBeOnTheScreen();

    await press('Grant');
    expect(screen.getByText('Say why; the player is told.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'One feature' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Opening and endgame trainer' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Until revoked' }));
    await fireEvent.changeText(screen.getByLabelText('Reason (sent to the player)'), 'Tester');
    await press('Grant');
    await waitFor(() =>
      expect(server.lastTo('POST /api/v1/admin/players/bob/grants').body).toEqual({
        feature: 'trainer',
        days: null,
        reason: 'Tester',
      }),
    );
    expect(await screen.findByText('bob has ClawPlay Plus until 1 Feb 2026.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Reason (sent to the player)'), 'Done');
    await press(/^Revoke: ClawPlay Plus/);
    await waitFor(() =>
      expect(server.lastTo('POST /api/v1/admin/grants/gr1/revoke').body).toEqual({
        reason: 'Done',
      }),
    );
    expect(
      await screen.findByText(/^ClawPlay Plus · revoked 2 Jan 2026 · given by alice/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Revoke/ })).toBeNull();
  });

  test('a refused grant and a failed load are shown', async () => {
    let fail = true;
    await renderApp('/moderation/bob', {
      token: 'tok',
      routes: {
        ...ADMIN,
        'GET /api/v1/mod/players/bob': RECORD,
        'GET /api/v1/admin/players/bob/plan': () =>
          fail ? error(400, 'bad', 'Plans are down.') : { status: 200, body: bobPlan([]) },
        'POST /api/v1/admin/players/bob/grants': error(409, 'account_deleted', 'Deleted.'),
      },
    });
    expect(await screen.findByText('Plans are down.')).toBeOnTheScreen();
    fail = false;
    await press('Try again');
    await screen.findByText('bob is on the Free plan.');
    await fireEvent.changeText(screen.getByLabelText('Reason (sent to the player)'), 'x');
    await press('Grant');
    expect(await screen.findByText('Deleted.')).toBeOnTheScreen();
  });

  test('moderators do not see plans', async () => {
    await renderApp('/moderation/bob', {
      token: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: { ...ME, role: 'moderator' } },
        'GET /api/v1/mod/players/bob': RECORD,
      },
    });
    expect(await screen.findByText('In good standing')).toBeOnTheScreen();
    expect(screen.queryByText('Plan')).toBeNull();
  });
});

test('an upsell still leads to the plans when they cannot be loaded', async () => {
  const { app } = await open('/rooms', {
    'GET /api/v1/plans': error(400, 'bad', 'Plans are down.'),
  });
  await fireEvent.press(await screen.findByRole('button', { name: 'See plans' }));
  await waitFor(() => expect(app.getPathname()).toBe('/plans'));
});
