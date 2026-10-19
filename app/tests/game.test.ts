import { parseBfen } from '@/game/bfen';
import { LINES, POINTS, pointNamed } from '@/game/board';
import { ClockSync, formatClock, remainingMs } from '@/game/clock';
import { opposite, sideOf, statusLine } from '@/game/describe';
import { MoveOptions, parseMove } from '@/game/moves';
import { isNewer, latest } from '@/game/order';

import { ALICE, BOB, game } from './fixtures';

describe('board', () => {
  it('has 25 points and the 56 lines of the rules', () => {
    expect(POINTS).toHaveLength(25);
    expect(POINTS[0]).toEqual({ name: 'a1', file: 0, rank: 0 });
    expect(pointNamed('e5')).toEqual({ name: 'e5', file: 4, rank: 4 });
    expect(pointNamed('f1')).toBeUndefined();
    const diagonal = LINES.filter(([a, b]) => a.file !== b.file && a.rank !== b.rank);
    expect(LINES).toHaveLength(56);
    expect(diagonal).toHaveLength(16);
    const names = new Set(LINES.map(([a, b]) => `${a.name}${b.name}`));
    expect(names.has('a1b2')).toBe(true);
    expect(names.has('b1c2')).toBe(false); // b1 is an odd point: no diagonals
  });
});

describe('parseBfen', () => {
  it('reads the initial position', () => {
    const p = parseBfen('T3T/5/5/5/T3T g 20 0');
    expect([...p.pieces]).toEqual([
      ['a5', 'tiger'],
      ['e5', 'tiger'],
      ['a1', 'tiger'],
      ['e1', 'tiger'],
    ]);
    expect(p).toMatchObject({ toMove: 'goat', goatsInHand: 20, goatsCaptured: 0 });
  });

  it('reads goats, tigers to move and counts', () => {
    const p = parseBfen('TG2T/1G3/2G2/5/T3T t 17 1');
    expect(p.pieces.get('b5')).toBe('goat');
    expect(p.pieces.get('b4')).toBe('goat');
    expect(p.pieces.get('c3')).toBe('goat');
    expect(p).toMatchObject({ toMove: 'tiger', goatsInHand: 17, goatsCaptured: 1 });
  });

  it.each([
    ['T3T/5/5/5/T3T g 20', 'expected 4 fields'],
    ['T3T/5/5/5 g 20 0', 'expected 5 ranks'],
    ['T3T/5/5/5/T3X g 20 0', 'unexpected "X"'],
    ['T3TG/5/5/5/T3T g 20 0', 'rank 5 is too long'],
    ['T3/5/5/5/T3T g 20 0', 'rank 5 does not have 5 points'],
    ['T3T/5/5/5/T3T x 20 0', 'side to move'],
    ['T3T/5/5/5/T3T g many 0', 'bad goat counts'],
    ['T3T/5/5/5/T3T g 20 10', 'bad goat counts'],
  ])('rejects %s', (bfen, why) => {
    expect(() => parseBfen(bfen)).toThrow(why);
  });
});

describe('moves', () => {
  it('parses the three kinds of move', () => {
    expect(parseMove('c3')).toEqual({ kind: 'place', to: 'c3', text: 'c3' });
    expect(parseMove('a1-b2')).toEqual({ kind: 'step', from: 'a1', to: 'b2', text: 'a1-b2' });
    expect(parseMove('a1xc3')).toEqual({
      kind: 'capture',
      from: 'a1',
      to: 'c3',
      over: 'b2',
      text: 'a1xc3',
    });
    expect(parseMove('c1xc3')).toMatchObject({ over: 'c2' });
    for (const bad of ['', 'f1', 'a1-', 'a1+b2', 'c3 ']) expect(parseMove(bad)).toBeNull();
  });

  it('places goats with one tap', () => {
    const options = new MoveOptions(['a2', 'b1', 'junk']);
    expect(options.placements).toEqual(new Set(['a2', 'b1']));
    expect(options.movable().size).toBe(0);
    expect(options.tap(null, 'a2')).toEqual({ selected: null, move: 'a2' });
    expect(options.tap(null, 'c3')).toEqual({ selected: null, move: null });
  });

  it('moves pieces by picking up, then putting down', () => {
    const options = new MoveOptions(['a1-a2', 'a1xc3', 'e1-d1']);
    expect(options.movable()).toEqual(new Set(['a1', 'e1']));
    expect([...options.targets('a1').keys()]).toEqual(['a2', 'c3']);
    expect(options.targets(null).size).toBe(0);
    expect(options.targets('c3').size).toBe(0);

    expect(options.tap(null, 'a1')).toEqual({ selected: 'a1', move: null });
    expect(options.tap('a1', 'a1')).toEqual({ selected: null, move: null }); // put back
    expect(options.tap('a1', 'e1')).toEqual({ selected: 'e1', move: null }); // switch piece
    expect(options.tap('a1', 'c3')).toEqual({ selected: null, move: 'a1xc3' });
    expect(options.tap('a1', 'b3')).toEqual({ selected: null, move: null }); // elsewhere: drop
  });
});

describe('ordering snapshots', () => {
  const at = (ply: number, status: 'active' | 'finished', time: string) =>
    game({ ply, status, server_time: `2026-10-19T10:00:${time}Z` });

  it('prefers a higher ply, then a finished game, then a later server time', () => {
    expect(isNewer(undefined, at(0, 'active', '00'))).toBe(true);
    expect(isNewer(at(3, 'active', '09'), at(4, 'active', '01'))).toBe(true);
    expect(isNewer(at(4, 'active', '01'), at(3, 'finished', '09'))).toBe(false);
    expect(isNewer(at(4, 'active', '09'), at(4, 'finished', '01'))).toBe(true);
    expect(isNewer(at(4, 'finished', '01'), at(4, 'active', '09'))).toBe(false);
    expect(isNewer(at(4, 'active', '01'), at(4, 'active', '02'))).toBe(true);
    expect(isNewer(at(4, 'active', '02'), at(4, 'active', '01'))).toBe(false);
  });

  it('keeps the latest', () => {
    const old = at(1, 'active', '00');
    const now = at(2, 'active', '00');
    expect(latest(old, now)).toBe(now);
    expect(latest(now, old)).toBe(now);
    expect(latest(undefined, old)).toBe(old);
  });
});

describe('clocks', () => {
  it('estimates the server clock from the quickest sample', () => {
    const sync = new ClockSync(2);
    expect(sync.offset()).toBe(0);
    sync.observe('2026-10-19T10:00:00Z', Date.parse('2026-10-19T10:00:00.300Z'));
    sync.observe('2026-10-19T10:00:00Z', Date.parse('2026-10-19T10:00:00.100Z'));
    expect(sync.offset()).toBe(100);
    sync.observe('not a date', 0);
    expect(sync.offset()).toBe(100);
    sync.observe('2026-10-19T10:00:00Z', Date.parse('2026-10-19T10:00:00.200Z'));
    sync.observe('2026-10-19T10:00:00Z', Date.parse('2026-10-19T10:00:00.250Z'));
    expect(sync.offset()).toBe(200); // the 100 ms sample has aged out
    expect(sync.serverNow(1_000)).toBe(800);
    expect(new ClockSync().offset()).toBe(0);
  });

  it('counts down only the running clock, never below zero', () => {
    const clocks = { goat_ms: 60_000, tiger_ms: 30_000, running: 'goat' as const };
    const t = '2026-10-19T10:00:00Z';
    const now = Date.parse(t);
    expect(remainingMs(clocks, t, 'goat', now + 1_500)).toBe(58_500);
    expect(remainingMs(clocks, t, 'tiger', now + 1_500)).toBe(30_000);
    expect(remainingMs(clocks, t, 'goat', now - 5_000)).toBe(60_000);
    expect(remainingMs(clocks, t, 'goat', now + 99_000)).toBe(0);
    expect(remainingMs({ ...clocks, running: 'tiger' }, t, 'tiger', now + 1_000)).toBe(29_000);
  });

  it('formats like a chess clock', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(61_001)).toBe('1:02');
    expect(formatClock(10_000)).toBe('0:10');
    expect(formatClock(9_950)).toBe('9.9');
    expect(formatClock(0)).toBe('0.0');
    expect(formatClock(-5)).toBe('0.0');
  });
});

describe('describe', () => {
  it('knows who plays what', () => {
    const g = game();
    expect(sideOf(g, ALICE.id)).toBe('goat');
    expect(sideOf(g, BOB.id)).toBe('tiger');
    expect(sideOf(g, 'someone else')).toBeNull();
    expect(opposite('goat')).toBe('tiger');
    expect(opposite('tiger')).toBe('goat');
  });

  it('tells each player what to do', () => {
    expect(statusLine(game(), 'goat')).toBe('Your move: place a goat (20 in hand).');
    expect(statusLine(game(), 'tiger')).toBe('Waiting for alice…');
    expect(statusLine(game(), null)).toBe('Waiting for alice…');
    const moving = game({ position: 'T3T/5/5/5/T3T g 0 0' });
    expect(statusLine(moving, 'goat')).toBe('Your move: move a goat.');
    const tigers = game({ side_to_move: 'tiger', position: 'T3T/5/5/5/T3T t 19 0' });
    expect(statusLine(tigers, 'tiger')).toBe('Your move: move or capture with a tiger.');
  });

  it('explains results', () => {
    const over = (winner: 'goat' | 'tiger' | null, reason: string) =>
      game({ status: 'finished', result: { winner, reason: reason as never } });
    expect(statusLine(over('tiger', 'five_captured'), 'tiger')).toBe(
      'You won! bob captured five goats.',
    );
    expect(statusLine(over('goat', 'tigers_trapped'), 'tiger')).toBe(
      'alice won. alice trapped every tiger.',
    );
    expect(statusLine(over('tiger', 'goats_blocked'), null)).toBe(
      'bob won. alice had no move left.',
    );
    expect(statusLine(over('goat', 'timeout'), 'goat')).toBe('You won! bob ran out of time.');
    expect(statusLine(over('goat', 'resigned'), 'goat')).toBe('You won! bob resigned.');
    expect(statusLine(over('tiger', 'abandoned'), 'goat')).toBe('bob won. alice left the game.');
    expect(statusLine(over('goat', 'something_new'), 'goat')).toBe('You won!');
    expect(statusLine(over(null, 'aborted'), 'goat')).toBe('Game aborted: no result.');
  });
});
