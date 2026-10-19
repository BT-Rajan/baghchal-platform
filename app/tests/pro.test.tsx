import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { ME, error, type Route } from './support/fakeServer';
import { BOB, game } from './support/games';

import type { MyPlan, Pairing, Room, Tournament, Trainer } from '@/api/endpoints';

const ALICE = { id: ME.id, username: 'alice' };
const PRO: MyPlan = {
  plan: 'pro',
  plan_until: null,
  features: [
    'analysis',
    'badge',
    'computer_hard',
    'full_history',
    'private_rooms',
    'themes',
    'tournaments',
    'trainer',
  ],
  grants: [],
};

function open(url: string, routes: Record<string, Route> = {}, plan: MyPlan | null = PRO) {
  return renderApp(url, {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      ...(plan === null ? {} : { 'GET /api/v1/me/plan': { status: 200, body: plan } }),
      ...routes,
    },
  });
}

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

const room = (overrides: Partial<Room> = {}): Room => ({
  code: 'abc123',
  host: ALICE,
  time_control: '5+3',
  host_side: 'random',
  status: 'open',
  game_id: null,
  expires_at: '2026-01-02T12:00:00Z',
  ...overrides,
});

describe('private rooms', () => {
  test('need Pro', async () => {
    await open('/rooms', {}, null);
    expect(await screen.findByText('Private rooms come with ClawPlay Pro.')).toBeOnTheScreen();
  });

  test('make one, share it, close it', async () => {
    let rooms: Room[] = [];
    const { server, app } = await open('/play', {
      'GET /api/v1/seeks': { status: 200, body: [] },
      'GET /api/v1/rooms': () => ({ status: 200, body: rooms }),
      'POST /api/v1/rooms': () => {
        rooms = [room({ host_side: 'tiger', time_control: '10+5' })];
        return { status: 201, body: rooms[0] };
      },
      'POST /api/v1/rooms/abc123/close': () => {
        rooms = [];
        return { status: 200, body: room({ status: 'closed' }) };
      },
    });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Invite a friend (private room)' }),
    );
    await waitFor(() => expect(app.getPathname()).toBe('/rooms'));
    expect(await screen.findByText('No open rooms.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: '10+5' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Tigers' }));
    await press('Make a room');
    await waitFor(() =>
      expect(server.lastTo('POST /api/v1/rooms').body).toEqual({
        time_control: '10+5',
        side: 'tiger',
      }),
    );
    expect(await screen.findByText('10+5 casual game · you play tigers')).toBeOnTheScreen();
    expect(screen.getByText('/room/abc123')).toBeOnTheScreen();
    await press('Close room abc123');
    expect(await screen.findByText('No open rooms.')).toBeOnTheScreen();
    await waitFor(() => expect(server.lastTo('POST /api/v1/rooms/abc123/close')).toBeDefined());
  });

  test('a refused room and a failed list are shown', async () => {
    await open('/rooms', {
      'GET /api/v1/rooms': error(400, 'bad', 'Rooms are down.'),
      'POST /api/v1/rooms': error(409, 'too_many_rooms', 'Close one first.'),
    });
    expect(await screen.findByText('Rooms are down.')).toBeOnTheScreen();
    await press('Make a room');
    expect(await screen.findByText('Close one first.')).toBeOnTheScreen();
  });

  test('a friend opens the link and plays', async () => {
    const theirs = room({ host: BOB, host_side: 'goat' });
    const { app } = await open(
      '/room/abc123',
      {
        'GET /api/v1/rooms/abc123': { status: 200, body: theirs },
        'POST /api/v1/rooms/abc123/join': {
          status: 200,
          body: { ...theirs, status: 'played', game_id: 'g1' },
        },
        'GET /api/v1/games/g1': {
          status: 200,
          body: game({ server_time: new Date().toISOString() }),
        },
      },
      null,
    );
    expect(
      await screen.findByText(
        'bob invites you to a 5+3 casual game. bob plays goats; you play tigers.',
      ),
    ).toBeOnTheScreen();
    await press('Join and play');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
  });

  test('a host offline', async () => {
    await open(
      '/room/abc123',
      {
        'GET /api/v1/rooms/abc123': { status: 200, body: room({ host: BOB }) },
        'POST /api/v1/rooms/abc123/join': error(409, 'host_offline', 'bob is not online.'),
      },
      null,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Join and play' }));
    expect(await screen.findByText('bob is not online.')).toBeOnTheScreen();
  });

  test.each([
    [room({ host: BOB, status: 'closed' }), 'This room is closed. Ask your friend for a new link.'],
    [room(), 'Send this link to a friend. The game starts when they open it.'],
    [room({ status: 'closed' }), 'This room is closed.'],
  ])('room states: %#', async (body, text) => {
    await open('/room/abc123', { 'GET /api/v1/rooms/abc123': { status: 200, body } }, null);
    expect(await screen.findByText(text)).toBeOnTheScreen();
  });

  test('once played, both can go to the game', async () => {
    const { app } = await open(
      '/room/abc123',
      {
        'GET /api/v1/rooms/abc123': {
          status: 200,
          body: room({ status: 'played', game_id: 'g1' }),
        },
        'GET /api/v1/games/g1': {
          status: 200,
          body: game({ server_time: new Date().toISOString() }),
        },
      },
      null,
    );
    expect(await screen.findByText('Your friend joined.')).toBeOnTheScreen();
    await press('Go to the game');
    await waitFor(() => expect(app.getPathname()).toBe('/game/g1'));
  });

  test('an unknown room', async () => {
    await open(
      '/room/nope',
      { 'GET /api/v1/rooms/nope': error(404, 'room_not_found', 'No such room.') },
      null,
    );
    expect(await screen.findByText('No such room.')).toBeOnTheScreen();
  });
});

const pairing = (overrides: Partial<Pairing> = {}): Pairing => ({
  id: 'p1',
  goat: ALICE,
  tiger: BOB,
  state: 'waiting',
  game_id: null,
  winner: null,
  ...overrides,
});
const CAROL = { id: '00000000-0000-4000-8000-0000000000c0', username: 'carol' };
const tournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  code: 'cup1',
  name: 'Friday cup',
  host: ALICE,
  time_control: '5+3',
  max_players: 6,
  status: 'open',
  players: [ALICE, BOB],
  standings: [],
  pairings: [],
  created_at: '2026-01-01T12:00:00Z',
  ...overrides,
});

describe('tournaments', () => {
  test('anyone sees theirs; hosting needs Pro', async () => {
    const { app } = await open(
      '/tournaments',
      {
        'GET /api/v1/tournaments': {
          status: 200,
          body: [tournament({ host: BOB, players: [BOB, ALICE] })],
        },
        'GET /api/v1/tournaments/cup1': { status: 200, body: tournament({ host: BOB }) },
      },
      null,
    );
    expect(
      await screen.findByText('Hosting a tournament comes with ClawPlay Pro.'),
    ).toBeOnTheScreen();
    expect(
      await screen.findByText('5+3 · hosted by bob · Waiting for players: 2 of 6'),
    ).toBeOnTheScreen();
    await press('Open Friday cup');
    await waitFor(() => expect(app.getPathname()).toBe('/tournament/cup1'));
  });

  test('host one', async () => {
    const { app, server } = await open('/tournaments', {
      'GET /api/v1/tournaments': { status: 200, body: [] },
      'POST /api/v1/tournaments': { status: 201, body: tournament({ players: [ALICE] }) },
      'GET /api/v1/tournaments/cup1': { status: 200, body: tournament({ players: [ALICE] }) },
    });
    expect(
      await screen.findByText(
        'You are not in any tournament yet. Join one with a link from a friend.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create the tournament' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Name'), '  Friday cup ');
    await fireEvent.press(screen.getByRole('radio', { name: '4 players' }));
    await press('Create the tournament');
    await waitFor(() => expect(app.getPathname()).toBe('/tournament/cup1'));
    expect(server.lastTo('POST /api/v1/tournaments').body).toEqual({
      name: 'Friday cup',
      time_control: '5+3',
      max_players: 4,
    });
    expect(await screen.findByText('At least 3 players are needed to start.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start the tournament' })).toBeDisabled();
    expect(screen.getByText('/tournament/cup1')).toBeOnTheScreen();
  });

  test('join, leave, and a refusal', async () => {
    let players = [BOB];
    const { server } = await open(
      '/tournament/cup1',
      {
        'GET /api/v1/tournaments/cup1': () => ({
          status: 200,
          body: tournament({ host: BOB, players }),
        }),
        'POST /api/v1/tournaments/cup1/join': () => {
          players = [BOB, ALICE];
          return { status: 200, body: tournament({ host: BOB, players }) };
        },
        'POST /api/v1/tournaments/cup1/leave': error(409, 'tournament_started', 'Started.'),
      },
      null,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Join' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Started.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/tournaments/cup1/join')).toBeDefined();
  });

  const running = (): Tournament =>
    tournament({
      status: 'running',
      players: [ALICE, BOB, CAROL],
      standings: [
        { player: BOB, points: 1, played: 1 },
        { player: ALICE, points: 0, played: 1 },
        { player: CAROL, points: 0, played: 0 },
      ],
      pairings: [
        pairing({ state: 'done', game_id: 'g0', winner: BOB }),
        pairing({ id: 'p2', goat: BOB, tiger: ALICE }),
        pairing({ id: 'p3', goat: ALICE, tiger: CAROL, state: 'playing', game_id: 'g9' }),
        pairing({ id: 'p4', goat: BOB, tiger: CAROL }),
      ],
    });

  test('the host starts it and ends it', async () => {
    let t = tournament({ players: [ALICE, BOB, CAROL] });
    const { server } = await open('/tournament/cup1', {
      'GET /api/v1/tournaments/cup1': () => ({ status: 200, body: t }),
      'POST /api/v1/tournaments/cup1/start': () => {
        t = running();
        return { status: 200, body: t };
      },
      'POST /api/v1/tournaments/cup1/finish': () => {
        t = { ...running(), status: 'finished' };
        return { status: 200, body: t };
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Start the tournament' }));
    expect(await screen.findByText('1 point')).toBeOnTheScreen();
    expect(screen.getAllByText('0 points')).toHaveLength(2);
    // Mine to play, and everyone's.
    expect(screen.getAllByText('alice (goats) v bob (tigers) · won by bob')).toHaveLength(2);
    expect(screen.getByText('bob (goats) v carol (tigers) · to play')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play bob v carol' })).toBeNull();

    await press('End the tournament');
    expect(await screen.findByText(/^5\+3 · hosted by alice · Finished/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'End the tournament' })).toBeNull();
    expect(server.lastTo('POST /api/v1/tournaments/cup1/finish')).toBeDefined();
  });

  test('start one of my games', async () => {
    const started = game({
      id: 'g2',
      goat: BOB,
      tiger: ALICE,
      server_time: new Date().toISOString(),
    });
    const { app } = await open('/tournament/cup1', {
      'GET /api/v1/tournaments/cup1': { status: 200, body: running() },
      'POST /api/v1/tournaments/cup1/pairings/p2/play': { status: 200, body: started },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Play bob v alice' }));
    await waitFor(() => expect(app.getPathname()).toBe('/game/g2'));
  });

  test('open one being played', async () => {
    const { app } = await open('/tournament/cup1', {
      'GET /api/v1/tournaments/cup1': { status: 200, body: running() },
      'GET /api/v1/games/g9': {
        status: 200,
        body: game({ id: 'g9', server_time: new Date().toISOString() }),
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Open alice v carol' }));
    await waitFor(() => expect(app.getPathname()).toBe('/game/g9'));
  });

  test('a failed load', async () => {
    await open('/tournament/x', {
      'GET /api/v1/tournaments/x': error(404, 'tournament_not_found', 'No such tournament.'),
    });
    expect(await screen.findByText('No such tournament.')).toBeOnTheScreen();
  });
});

const trainer = (overrides: Partial<Trainer> = {}): Trainer => ({
  kind: 'opening',
  solved: 0,
  total: 60,
  streak: 0,
  puzzle: {
    id: 'o001',
    kind: 'opening',
    position: 'T3T/5/5/5/T3T g 20 0',
    side: 'goat',
    legal_moves: ['a2', 'c3'],
  },
  ...overrides,
});

describe('the trainer', () => {
  test('needs Pro', async () => {
    await open('/trainer', {}, null);
    expect(
      await screen.findByText(/^The opening and endgame trainer comes with ClawPlay Pro/),
    ).toBeOnTheScreen();
  });

  test('find the best move, or be shown it', async () => {
    let answers = 0;
    const { server } = await open('/play', {
      'GET /api/v1/seeks': { status: 200, body: [] },
      'GET /api/v1/trainer': (request) =>
        request.query.kind === 'endgame'
          ? { status: 200, body: trainer({ kind: 'endgame', puzzle: null, solved: 60 }) }
          : { status: 200, body: trainer({ solved: answers }) },
      'POST /api/v1/trainer/o001/answer': (request) => {
        answers += 1;
        const move = (request.body as { move: string }).move;
        return {
          status: 200,
          body: { correct: move === 'c3', best: 'c3', solved: 1, total: 60, streak: answers },
        };
      },
    });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Trainer: opening and endgame puzzles' }),
    );
    expect(await screen.findByText('Goats to play: find the best move.')).toBeOnTheScreen();
    expect(screen.getByText('Solved 0 of 60 · Streak 0')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'a2, empty, move here' }));
    expect(await screen.findByText('Not quite. The best move was c3.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/trainer/o001/answer').body).toEqual({ move: 'a2' });
    await press('Next puzzle');
    await fireEvent.press(await screen.findByRole('button', { name: 'c3, empty, move here' }));
    expect(await screen.findByText('Correct! That is the best move.')).toBeOnTheScreen();
    expect(screen.getByText('Solved 1 of 60 · Streak 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Endgames' }));
    expect(
      await screen.findByText('You have solved every puzzle here. Well played!'),
    ).toBeOnTheScreen();
  });

  test('a refused answer and a failed load', async () => {
    let fail = true;
    await open('/trainer', {
      'GET /api/v1/trainer': () =>
        fail ? error(400, 'bad', 'Puzzles are down.') : { status: 200, body: trainer() },
      'POST /api/v1/trainer/o001/answer': error(400, 'illegal_move', 'Not legal.'),
    });
    expect(await screen.findByText('Puzzles are down.')).toBeOnTheScreen();
    fail = false;
    await press('Try again');
    await fireEvent.press(await screen.findByRole('button', { name: 'c3, empty, move here' }));
    expect(await screen.findByText('Not legal.')).toBeOnTheScreen();
  });

  test('a position that cannot be shown', async () => {
    await open('/trainer', {
      'GET /api/v1/trainer': {
        status: 200,
        body: trainer({ puzzle: { ...trainer().puzzle!, position: 'nonsense' } }),
      },
    });
    expect(await screen.findByText('This position could not be shown.')).toBeOnTheScreen();
  });

  test('a failed plan', async () => {
    await open('/trainer', { 'GET /api/v1/me/plan': error(400, 'bad', 'Plans are down.') }, null);
    expect(await screen.findByText('Plans are down.')).toBeOnTheScreen();
  });
});
