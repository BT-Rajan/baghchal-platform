import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { FakeSocket } from './support/fakeSocket';
import { BOB, challenge, game } from './support/games';

const SIGNED_IN = { 'GET /api/v1/me': { status: 200, body: ME } };
const ALICE = { id: ME.id, username: ME.username };
const CAROL = { id: '00000000-0000-4000-8000-000000000003', username: 'carol' };
const DAVE = { id: '00000000-0000-4000-8000-000000000004', username: 'dave' };

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** A challenge made just now, by the test's clock, that expires in `s` seconds. */
const fresh = (s: number) => ({ created_at: inSeconds(0), expires_at: inSeconds(s) });

function lobby(routes: Record<string, Route> = {}) {
  return renderApp('/', { token: 'tok', routes: { ...SIGNED_IN, ...routes } });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

const ONLINE: Route = {
  status: 200,
  body: [
    { ...ALICE, online: true, playing: false },
    { ...BOB, online: true, playing: false },
    { ...CAROL, online: true, playing: true },
  ],
};

describe('players', () => {
  test('lists who is online; only free players can be challenged', async () => {
    await lobby({ 'GET /api/v1/players/online': ONLINE });
    expect(await screen.findByText('bob')).toBeOnTheScreen();
    expect(screen.getByText('You')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Challenge alice' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Challenge bob' })).toBeEnabled();
    expect(screen.getByText('Playing')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Challenge carol' })).toBeDisabled();
  });

  test('a guest sees who is online, with no Challenge buttons (that needs an account)', async () => {
    await renderApp('/', {
      token: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: { ...ME, username: 'guest-3fa9c1', role: 'guest' } },
        'GET /api/v1/players/online': ONLINE,
      },
    });
    expect(await screen.findByText('bob')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Challenge bob' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Challenge a friend by link' })).toBeNull();
  });

  test('says when nobody is online', async () => {
    await lobby();
    expect(await screen.findByText(/^Nobody else is online right now\./)).toBeOnTheScreen();
  });

  test('searches by username prefix', async () => {
    const { server } = await lobby({
      'GET /api/v1/players': (request) => ({
        status: 200,
        body: request.query.prefix === 'da' ? [{ ...DAVE, online: false, playing: false }] : [],
      }),
    });
    await screen.findByText(/^Nobody else is online right now\./);
    await fireEvent.changeText(screen.getByLabelText('Find a player'), ' da');
    expect(await screen.findByText('dave')).toBeOnTheScreen();
    expect(screen.getByText('Players starting with “da”')).toBeOnTheScreen();
    expect(screen.getByText('Offline')).toBeOnTheScreen();
    expect(server.lastTo('GET /api/v1/players').query).toEqual({ prefix: 'da' });

    await fireEvent.changeText(screen.getByLabelText('Find a player'), 'zz');
    expect(await screen.findByText('No players found.')).toBeOnTheScreen();
    // Characters that cannot be in a username are not searched for.
    await fireEvent.changeText(screen.getByLabelText('Find a player'), 'z z');
    expect(await screen.findByText('Online now')).toBeOnTheScreen();
  });

  test('shows a failed player list', async () => {
    await lobby({ 'GET /api/v1/players/online': error(503, 'unavailable', 'Try later.') });
    expect(await screen.findByText('Try later.', {}, { timeout: 5000 })).toBeOnTheScreen();
  });
});

describe('challenges', () => {
  test('an incoming challenge, with its terms and countdown, can be accepted', async () => {
    const c = challenge({ ...fresh(42), game_id: null });
    const { app, server } = await lobby({
      'GET /api/v1/challenges': { status: 200, body: { incoming: [c], outgoing: [] } },
      'POST /api/v1/challenges/c1/accept': {
        status: 200,
        body: { ...c, status: 'accepted', game_id: 'g1' },
      },
      'GET /api/v1/games/g1': { status: 200, body: game() },
    });
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();
    expect(screen.getByText('5+3 · casual · random sides')).toBeOnTheScreen();
    expect(screen.getByText(/^Expires in \d+ s$/)).toBeOnTheScreen();

    await press("Accept bob's challenge");
    expect(await screen.findByText('alice (you)')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/game/g1');
    expect(server.lastTo('POST /api/v1/challenges/c1/accept')).toBeDefined();
  });

  test('when the live event wins the race with the answer, the game still opens once', async () => {
    const c = challenge({ ...fresh(42) });
    const { app } = await lobby({
      'GET /api/v1/challenges': { status: 200, body: { incoming: [c], outgoing: [] } },
      'POST /api/v1/challenges/c1/accept': () => {
        FakeSocket.latest().receive({ type: 'game', game: game() });
        return { status: 200, body: { ...c, status: 'accepted', game_id: 'g1' } };
      },
      'GET /api/v1/games/g1': { status: 200, body: game() },
    });
    await screen.findByText('bob challenges you');
    await act(() => FakeSocket.latest().open());
    await press("Accept bob's challenge");
    expect(await screen.findByText('alice (you)')).toBeOnTheScreen();
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
    // The app's own stack sits under the router's root route.
    const stack = app.getRouterState()?.routes[0]?.state?.routes.map((route) => route.name);
    expect(stack).toEqual(['(tabs)', 'game/[id]']);
  });

  test('other refusals are shown without reloading the list', async () => {
    const c = challenge({ ...fresh(30) });
    const { server } = await lobby({
      'GET /api/v1/challenges': { status: 200, body: { incoming: [c], outgoing: [] } },
      'POST /api/v1/challenges/c1/accept': error(
        409,
        'player_busy',
        'One of you is already playing a game.',
      ),
    });
    await screen.findByText('bob challenges you');
    await press("Accept bob's challenge");
    expect(await screen.findByText('One of you is already playing a game.')).toBeOnTheScreen();
    expect(server.requests.filter((r) => r.path === '/api/v1/challenges')).toHaveLength(1);
    expect(screen.getByText('bob challenges you')).toBeOnTheScreen();
  });

  test('declining removes the challenge', async () => {
    const c = challenge({ ...fresh(30) });
    await lobby({
      'GET /api/v1/challenges': { status: 200, body: { incoming: [c], outgoing: [] } },
      'POST /api/v1/challenges/c1/decline': { status: 200, body: { ...c, status: 'declined' } },
    });
    await screen.findByText('bob challenges you');
    await press("Decline bob's challenge");
    await waitFor(() => expect(screen.queryByText('bob challenges you')).toBeNull());
  });

  test('a challenge that closed meanwhile is reported, and the list refreshed', async () => {
    const c = challenge({ ...fresh(30) });
    let listed = [c];
    await lobby({
      'GET /api/v1/challenges': () => ({ status: 200, body: { incoming: listed, outgoing: [] } }),
      'POST /api/v1/challenges/c1/accept': () => {
        listed = [];
        return error(409, 'challenge_closed', 'This challenge is no longer open.');
      },
    });
    await screen.findByText('bob challenges you');
    await press("Accept bob's challenge");
    expect(await screen.findByText('This challenge is no longer open.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('bob challenges you')).toBeNull());
  });

  test('my own challenge can be cancelled', async () => {
    const mine = challenge({
      challenger: ALICE,
      opponent: BOB,
      rated: true,
      side: null,
      ...fresh(50),
    });
    await lobby({
      'GET /api/v1/challenges': { status: 200, body: { incoming: [], outgoing: [mine] } },
      'POST /api/v1/challenges/c1/cancel': { status: 200, body: { ...mine, status: 'cancelled' } },
    });
    expect(await screen.findByText('Waiting for bob')).toBeOnTheScreen();
    expect(screen.getByText('5+3 · rated match (2 games)')).toBeOnTheScreen();
    await press('Cancel the challenge to bob');
    await waitFor(() => expect(screen.queryByText('Waiting for bob')).toBeNull());
  });

  test('expired challenges are not shown', async () => {
    await lobby({
      'GET /api/v1/challenges': {
        status: 200,
        body: { incoming: [challenge({ ...fresh(-1) })], outgoing: [] },
      },
    });
    await screen.findByText('Online now');
    await waitFor(() => expect(screen.queryByText('bob challenges you')).toBeNull());
  });

  test('a failed challenge list is reported', async () => {
    await lobby({ 'GET /api/v1/challenges': error(400, 'bad', 'Could not load challenges.') });
    expect(await screen.findByText('Could not load challenges.')).toBeOnTheScreen();
  });
});

describe('live events', () => {
  test('a challenge arrives, and the game it starts opens by itself', async () => {
    const { app } = await lobby({ 'GET /api/v1/games/g1': { status: 200, body: game() } });
    await screen.findByText('Online now');
    const socket = FakeSocket.latest();
    await act(() => {
      socket.open();
      socket.receive({ type: 'challenge', challenge: challenge({ ...fresh(55) }) });
    });
    expect(await screen.findByText('bob challenges you')).toBeOnTheScreen();

    await act(() => socket.receive({ type: 'game', game: game() }));
    expect(await screen.findByText('alice (you)')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/game/g1');
  });

  test('a live game can be resumed from the lobby', async () => {
    const live = game({ ply: 6 });
    const { app } = await lobby({
      'GET /api/v1/games': { status: 200, body: [live] },
      'GET /api/v1/games/g1': { status: 200, body: live },
    });
    expect(await screen.findByText('Your game against bob is on.')).toBeOnTheScreen();
    await press('Resume game');
    expect(await screen.findByText('Your move')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/game/g1');
  });
});

describe('challenge form', () => {
  test('sends a casual challenge with the chosen side, then lists it', async () => {
    const { server, app } = await lobby({
      'GET /api/v1/players/online': ONLINE,
      'GET /api/v1/challenges': { status: 200, body: { incoming: [], outgoing: [] } },
      'POST /api/v1/challenges': {
        status: 201,
        body: challenge({
          challenger: ALICE,
          opponent: BOB,
          time_control: '2+1',
          side: 'tiger',
          ...fresh(60),
        }),
      },
    });
    await screen.findByText('bob');
    await press('Challenge bob');
    expect(await screen.findByRole('heading', { name: 'Challenge bob' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/challenge/bob');
    expect(screen.getByRole('radio', { name: 'Casual' })).toBeChecked(); // as everywhere

    await fireEvent.press(screen.getByRole('radio', { name: '2+1' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Tigers' }));
    expect(screen.getByRole('radio', { name: 'Tigers' })).toBeChecked();
    await press('Send challenge');

    expect(await screen.findByText('Waiting for bob')).toBeOnTheScreen();
    expect(screen.getByText('2+1 · casual · you play tigers')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/challenges').body).toEqual({
      opponent: 'bob',
      time_control: '2+1',
      rated: false,
      side: 'tiger',
    });
  });

  test('a rated challenge leaves the side to the match; errors are shown', async () => {
    const { server } = await renderApp('/challenge/bob', {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'POST /api/v1/challenges': error(409, 'player_offline', 'bob is not online.'),
      },
    });
    await screen.findByRole('heading', { name: 'Challenge bob' });
    await fireEvent.press(screen.getByRole('radio', { name: 'Rated' }));
    expect(screen.getByText(/rated match is two games/)).toBeOnTheScreen();
    await press('Send challenge');
    expect(await screen.findByText('bob is not online.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/challenges').body).toEqual({
      opponent: 'bob',
      time_control: '5+3',
      rated: true,
    });
  });

  test('cancel goes back, or to the lobby when there is nowhere to go back to', async () => {
    const { app } = await renderApp('/challenge/bob', { token: 'tok', routes: SIGNED_IN });
    await screen.findByRole('heading', { name: 'Challenge bob' });
    await press('Cancel');
    expect(await screen.findByRole('heading', { name: 'Play' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });
});

describe('profiles', () => {
  const PROFILE = {
    ...BOB,
    online: true,
    playing: false,
    blocked: false,
    created_at: '2026-03-02T10:00:00Z',
    ratings: {
      blitz: { rating: 1612, deviation: 80, games: 23, provisional: false, rank: 3 },
      rapid: { rating: 1500, deviation: 350, games: 1, provisional: true, rank: null },
    },
  };

  test("shows a player's ratings and lets you challenge them", async () => {
    const { app } = await renderApp('/player/bob', {
      token: 'tok',
      routes: { ...SIGNED_IN, 'GET /api/v1/players/bob': { status: 200, body: PROFILE } },
    });
    expect(await screen.findByText('Online · Joined March 2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quick rating 1612')).toBeOnTheScreen();
    expect(screen.getByText('23 games · #3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Standard rating 1500')).toBeOnTheScreen();
    expect(screen.getByText(/^A provisional rating is still settling/)).toBeOnTheScreen();
    expect(screen.getByText('1 game · provisional')).toBeOnTheScreen();
    await press('Challenge bob');
    expect(await screen.findByRole('heading', { name: 'Challenge bob' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/challenge/bob');
  });

  test('a busy player cannot be challenged; an unknown one is reported', async () => {
    await renderApp('/player/bob', {
      token: 'tok',
      routes: {
        ...SIGNED_IN,
        'GET /api/v1/players/bob': { status: 200, body: { ...PROFILE, playing: true } },
      },
    });
    await screen.findByText(/^Playing/);
    expect(screen.getByRole('button', { name: 'Challenge bob' })).toBeDisabled();
  });

  test('an unknown player', async () => {
    await renderApp('/player/nobody', {
      token: 'tok',
      routes: { ...SIGNED_IN, 'GET /api/v1/players/nobody': error(404, 'player_not_found') },
    });
    expect(await screen.findByText('No such player.')).toBeOnTheScreen();
  });

  test('my own page shows my ratings, not my email', async () => {
    await lobby({
      'GET /api/v1/players/alice': {
        status: 200,
        body: {
          ...PROFILE,
          ...ALICE,
          ratings: { blitz: PROFILE.ratings.rapid, rapid: PROFILE.ratings.rapid },
        },
      },
      'GET /api/v1/blocks': { status: 200, body: [] },
    });
    await screen.findByRole('heading', { name: 'Play' });
    await fireEvent.press(screen.getByRole('button', { name: /^Me, tab/ }));
    expect(await screen.findByLabelText('Quick rating 1500')).toBeOnTheScreen();
    expect(screen.queryByText('alice@example.com')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Challenge alice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block alice' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  });
});

describe('leaderboard', () => {
  test('pulling the page down asks again', async () => {
    let calls = 0;
    const { server } = await lobby({
      'GET /api/v1/leaderboards/blitz': () => {
        calls += 1;
        return {
          status: 200,
          body: calls === 1 ? [] : [{ rank: 1, player: BOB, rating: 1702, games: 40 }],
        };
      },
    });
    await screen.findByRole('heading', { name: 'Play' });
    await fireEvent.press(screen.getByRole('button', { name: /^Leaderboard, tab/ }));
    expect(await screen.findByText(/Nobody is listed yet/)).toBeOnTheScreen();
    // The page on top: the leaderboard (the Play tab stays mounted behind it).
    const page = screen.getAllByTestId('page').at(-1)!;
    await act(async () => {
      await page.props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText('1702')).toBeOnTheScreen();
    expect(server.requests.filter((r) => r.path === '/api/v1/leaderboards/blitz').length).toBe(2);
  });

  test('a podium, the rest below, and where I stand', async () => {
    const carol = { id: 'c', username: 'carol' };
    const dave = { id: 'd', username: 'dave' };
    await lobby({
      'GET /api/v1/leaderboards/blitz': {
        status: 200,
        body: [
          { rank: 1, player: BOB, rating: 1702, games: 40 },
          { rank: 2, player: carol, rating: 1680, games: 12 },
          { rank: 3, player: dave, rating: 1660, games: 9 },
          { rank: 4, player: ALICE, rating: 1650, games: 31 },
        ],
      },
      'GET /api/v1/leaderboards/rapid': { status: 200, body: [] },
      'GET /api/v1/players/alice': {
        status: 200,
        body: {
          ...ALICE,
          online: true,
          playing: false,
          blocked: false,
          created_at: ME.created_at,
          ratings: {
            blitz: { rating: 1650, deviation: 60, games: 31, provisional: false, rank: 4 },
          },
        },
      },
    });
    await screen.findByRole('heading', { name: 'Play' });
    await fireEvent.press(screen.getByRole('button', { name: /^Leaderboard, tab/ }));
    expect(await screen.findByText('1702')).toBeOnTheScreen();
    expect(screen.getByText('alice (you)')).toBeOnTheScreen();
    expect(screen.getByText('#4')).toBeOnTheScreen();
    expect(await screen.findByText('You are #4, rated 1650.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Standard' }));
    expect(await screen.findByText(/Nobody is listed yet/)).toBeOnTheScreen();
    expect(
      screen.getByText('You have no standard rating yet: play a rated game to get one.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play a rated game' })).toBeOnTheScreen();
  });

  test('a failed leaderboard is reported', async () => {
    await lobby({ 'GET /api/v1/leaderboards/blitz': error(400, 'bad', 'No leaderboard.') });
    await screen.findByRole('heading', { name: 'Play' });
    await fireEvent.press(screen.getByRole('button', { name: /^Leaderboard, tab/ }));
    expect(await screen.findByText('No leaderboard.')).toBeOnTheScreen();
  });
});
