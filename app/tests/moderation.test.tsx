import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { ModPlayer, Report } from '@/api/endpoints';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, game } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const AS_MODERATOR = { 'GET /api/v1/me': { status: 200, body: { ...ME, role: 'moderator' } } };
const CAROL = { id: '00000000-0000-4000-8000-000000000003', username: 'carol' };
const PROFILE = {
  status: 200,
  body: {
    ...BOB,
    online: true,
    playing: false,
    blocked: false,
    created_at: ME.created_at,
    ratings: {},
  },
};

function signedIn(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

function asModerator(url: string, routes: Record<string, Route> = {}) {
  return renderApp(url, { token: 'tok', routes: { ...AS_MODERATOR, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    reporter: CAROL,
    target: { ...BOB, suspended_until: null },
    reason: 'abuse',
    details: 'Insults after every game.',
    game_id: null,
    status: 'open',
    created_at: '2026-01-08T09:30:00Z',
    resolved_at: null,
    open_reports_against_target: 1,
    ...overrides,
  };
}

function record(overrides: Partial<ModPlayer> = {}): ModPlayer {
  return {
    ...BOB,
    created_at: '2026-01-01T12:00:00Z',
    role: 'player',
    deleted: false,
    suspended_until: null,
    banned: false,
    suspension_reason: null,
    reports: [report()],
    actions: [],
    ...overrides,
  };
}

describe('reporting a player', () => {
  test('from their profile', async () => {
    const { server } = await signedIn('/player/bob', {
      'GET /api/v1/players/bob': PROFILE,
      'POST /api/v1/players/bob/report': { status: 202, body: { status: 'accepted' } },
    });
    await screen.findByRole('button', { name: 'Report bob' });
    await press('Report bob');
    expect(await screen.findByRole('heading', { name: 'Report bob' })).toBeOnTheScreen();
    expect(screen.getByText(/The player is not told who reported them/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Abuse' }));
    await fireEvent.changeText(screen.getByLabelText('Details (optional)'), '  Rude in chat.  ');
    await press('Send report');
    expect(
      await screen.findByText('Thank you. A moderator will look at your report.'),
    ).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/players/bob/report').body).toEqual({
      reason: 'abuse',
      details: 'Rude in chat.',
    });
    await press('Done');
    expect(await screen.findByRole('button', { name: 'Report bob' })).toBeOnTheScreen();
  });

  test('from a finished game, which goes with the report', async () => {
    const finished = game({
      status: 'finished',
      result: { winner: 'tiger', reason: 'resigned' },
      server_time: new Date().toISOString(),
    });
    const { server, app } = await signedIn('/game/g1', {
      'GET /api/v1/games/g1': { status: 200, body: finished },
      'POST /api/v1/players/bob/report': { status: 202, body: { status: 'accepted' } },
    });
    await screen.findByRole('button', { name: 'Report bob' });
    await press('Report bob');
    expect(await screen.findByText(/The report includes this game/)).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/report/bob');
    await press('Send report');
    await screen.findByText('Thank you. A moderator will look at your report.');
    expect(server.lastTo('POST /api/v1/players/bob/report').body).toEqual({
      reason: 'cheating',
      details: '',
      game_id: 'g1',
    });
  });

  test('a failure is shown, and Cancel leaves', async () => {
    await signedIn('/report/bob', {
      'POST /api/v1/players/bob/report': error(429, 'rate_limited', 'Too many reports today.'),
    });
    await screen.findByRole('button', { name: 'Send report' });
    await press('Send report');
    expect(await screen.findByText('Too many reports today.')).toBeOnTheScreen();
    await press('Cancel');
    expect(await screen.findByRole('heading', { name: 'Play' })).toBeOnTheScreen();
  });
});

test('a suspended player is told why they cannot sign in', async () => {
  await renderApp('/sign-in', {
    routes: {
      'POST /api/v1/auth/login': error(
        403,
        'account_suspended',
        'This account is suspended until 08 January 2026, 12:00 UTC. Reason: Insults.',
      ),
    },
  });
  await fireEvent.changeText(await screen.findByLabelText('Username or email'), 'bob');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'whatever');
  await press('Sign in');
  expect(
    await screen.findByText(
      'This account is suspended until 08 January 2026, 12:00 UTC. Reason: Insults.',
    ),
  ).toBeOnTheScreen();
});

describe('the Me tab', () => {
  const ME_ROUTES = {
    'GET /api/v1/players/alice': {
      status: 200,
      body: { ...ME, online: true, playing: false, blocked: false, ratings: {} },
    },
    'GET /api/v1/blocks': { status: 200, body: [] },
  };

  test('players see no moderation', async () => {
    await signedIn('/me', ME_ROUTES);
    await screen.findByRole('button', { name: 'Account settings' });
    expect(screen.queryByRole('button', { name: 'Moderation' })).toBeNull();
  });

  test('moderators open the report queue from it', async () => {
    const { app } = await asModerator('/me', {
      ...ME_ROUTES,
      'GET /api/v1/mod/reports': { status: 200, body: [] },
    });
    await screen.findByRole('button', { name: 'Moderation' });
    await press('Moderation');
    expect(await screen.findByText('No open reports.')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/moderation');
  });
});

describe('the report queue', () => {
  test('lists reports and leads to the player', async () => {
    const { server, app } = await asModerator('/moderation', {
      'GET /api/v1/mod/reports': (request) => ({
        status: 200,
        body:
          request.query.status === 'open'
            ? [report({ open_reports_against_target: 2, game_id: 'g9' })]
            : [],
      }),
      'GET /api/v1/mod/players/bob': { status: 200, body: record() },
    });
    expect(await screen.findByText('carol reported bob')).toBeOnTheScreen();
    expect(screen.getByText('Abuse · 8 January 2026, 09:30 UTC')).toBeOnTheScreen();
    expect(screen.getByText('Insults after every game.')).toBeOnTheScreen();
    expect(screen.getByText('2 open reports about bob')).toBeOnTheScreen();
    expect(screen.getByText('Open the game')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Dismissed' }));
    expect(await screen.findByText('Nothing here yet.')).toBeOnTheScreen();
    expect(server.lastTo('GET /api/v1/mod/reports').query).toEqual({ status: 'dismissed' });
    await fireEvent.press(screen.getByRole('radio', { name: 'Open' }));

    await screen.findByRole('button', { name: 'Review bob' });
    await press('Review bob');
    expect(await screen.findByText('In good standing')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/moderation/bob');
  });

  test('looks up a player by name', async () => {
    const { app } = await asModerator('/moderation', {
      'GET /api/v1/mod/reports': { status: 200, body: [] },
      'GET /api/v1/mod/players/bob': { status: 200, body: record({ reports: [] }) },
    });
    await screen.findByText('No open reports.');
    await press("Open the player's record"); // nothing typed: stays
    expect(app.getPathname()).toBe('/moderation');
    await fireEvent.changeText(screen.getByLabelText('Look up a player'), ' bob ');
    await press("Open the player's record");
    expect(await screen.findByText('No reports.')).toBeOnTheScreen();
    expect(screen.getByText('No moderator has acted on this player.')).toBeOnTheScreen();
  });

  test('a moderator-only page refuses players', async () => {
    await signedIn('/moderation', {
      'GET /api/v1/mod/reports': error(403, 'not_a_moderator', 'Only moderators can do this.'),
    });
    expect(await screen.findByText('Only moderators can do this.')).toBeOnTheScreen();
  });
});

describe("a player's record", () => {
  test('suspending needs a reason, then shows the new state', async () => {
    const until = '2099-01-08T12:00:00Z';
    const suspended = record({
      suspended_until: until,
      suspension_reason: 'Insults.',
      reports: [report({ status: 'actioned' })],
      actions: [
        {
          action: 'suspend',
          reason: 'Insults.',
          moderator: 'alice',
          created_at: '2026-01-08T10:00:00Z',
        },
      ],
    });
    const { server } = await asModerator('/moderation/bob', {
      'GET /api/v1/mod/players/bob': { status: 200, body: record() },
      'POST /api/v1/mod/players/bob/suspend': { status: 200, body: suspended },
      'POST /api/v1/mod/players/bob/unsuspend': {
        status: 200,
        body: record({ reports: suspended.reports }),
      },
    });
    await screen.findByText('In good standing');
    await press('Suspend for 7 days');
    expect(screen.getByText('Say why; the player is told.')).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText('Reason (sent to the player for suspensions and renames)'),
      ' Insults. ',
    );
    await press('Suspend for 7 days');
    expect(await screen.findByText('Suspended until 8 January 2099, 12:00 UTC')).toBeOnTheScreen();
    expect(screen.getByText('Reason: Insults.')).toBeOnTheScreen();
    expect(screen.getByText('Suspended · alice · 8 January 2026, 10:00 UTC')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/mod/players/bob/suspend').body).toEqual({
      days: 7,
      reason: 'Insults.',
    });

    await fireEvent.changeText(
      screen.getByLabelText('Reason (sent to the player for suspensions and renames)'),
      'Appeal accepted.',
    );
    await press('Lift the suspension');
    expect(await screen.findByText('In good standing')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/mod/players/bob/unsuspend').body).toEqual({
      reason: 'Appeal accepted.',
    });
  });

  test('banning, and what the server refuses', async () => {
    const { server } = await asModerator('/moderation/bob', {
      'GET /api/v1/mod/players/bob': { status: 200, body: record() },
      'POST /api/v1/mod/players/bob/suspend': error(
        403,
        'cannot_moderate_moderator',
        'Moderators cannot act on moderators.',
      ),
    });
    await screen.findByText('In good standing');
    await fireEvent.changeText(
      screen.getByLabelText('Reason (sent to the player for suspensions and renames)'),
      'Cheating.',
    );
    await press('Ban permanently');
    expect(await screen.findByText('Moderators cannot act on moderators.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/mod/players/bob/suspend').body).toEqual({
      days: null,
      reason: 'Cheating.',
    });
  });

  test('renaming checks the name, then opens the renamed record', async () => {
    const renamed = record({ username: 'player-1', reports: [] });
    const { server, app } = await asModerator('/moderation/bob', {
      'GET /api/v1/mod/players/bob': { status: 200, body: record() },
      'POST /api/v1/mod/players/bob/rename': { status: 200, body: renamed },
      'GET /api/v1/mod/players/player-1': { status: 200, body: renamed },
    });
    await screen.findByText('In good standing');
    await fireEvent.changeText(
      screen.getByLabelText('Reason (sent to the player for suspensions and renames)'),
      'Offensive name.',
    );
    await fireEvent.changeText(screen.getByLabelText('New username'), 'x');
    await press('Rename bob');
    expect(screen.getByText(/^3–20 letters/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('New username'), 'player-1');
    await press('Rename bob');
    await waitFor(() => expect(app.getPathname()).toBe('/moderation/player-1'));
    expect(server.lastTo('POST /api/v1/mod/players/bob/rename').body).toEqual({
      username: 'player-1',
      reason: 'Offensive name.',
    });
  });

  test('dismissing a report', async () => {
    let dismissed = false;
    const { server } = await asModerator('/moderation/bob', {
      'GET /api/v1/mod/players/bob': () => ({
        status: 200,
        body: record({ reports: [report({ status: dismissed ? 'dismissed' : 'open' })] }),
      }),
      'POST /api/v1/mod/reports/r1/dismiss': () => {
        dismissed = true;
        return { status: 200, body: report({ status: 'dismissed' }) };
      },
    });
    await screen.findByText('Abuse · from carol · open');
    await fireEvent.changeText(
      screen.getByLabelText('Reason (sent to the player for suspensions and renames)'),
      'Not abuse.',
    );
    await press('Dismiss the report from carol');
    expect(await screen.findByText('Abuse · from carol · dismissed')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/mod/reports/r1/dismiss').body).toEqual({
      reason: 'Not abuse.',
    });
  });

  test('banned, deleted and moderator accounts', async () => {
    await asModerator('/moderation/bob', {
      'GET /api/v1/mod/players/bob': {
        status: 200,
        body: record({
          banned: true,
          suspended_until: '9999-12-31T00:00:00Z',
          suspension_reason: 'Cheating.',
          actions: [
            { action: 'suspend', reason: 'Cheating.', moderator: null, created_at: ME.created_at },
          ],
        }),
      },
    });
    expect(await screen.findByText('Banned')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lift the suspension' })).toBeOnTheScreen();

    await asModerator('/moderation/gone', {
      'GET /api/v1/mod/players/gone': {
        status: 200,
        body: record({ username: 'gone', deleted: true, reports: [] }),
      },
    });
    expect(await screen.findByText('Deleted account')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Suspend/ })).toBeNull();

    await asModerator('/moderation/kate', {
      'GET /api/v1/mod/players/kate': {
        status: 200,
        body: record({ username: 'kate', role: 'moderator', reports: [] }),
      },
    });
    expect(await screen.findByText('Moderator')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Suspend/ })).toBeNull();
  });

  test('an unknown player', async () => {
    await asModerator('/moderation/nobody', {
      'GET /api/v1/mod/players/nobody': error(404, 'player_not_found', 'No such player.'),
    });
    expect(await screen.findByText('No such player.')).toBeOnTheScreen();
  });
});
