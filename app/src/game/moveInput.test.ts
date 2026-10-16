import { highlights, movePoints, tap } from './moveInput';

const PLACING = ['a2', 'c3', 'e4'];
const MOVING = ['a1-a2', 'a1-b2', 'c3xc5', 'c3-d3', 'e5-e4'];

describe('placing goats', () => {
  test('every empty legal point is a target; nothing is movable', () => {
    const h = highlights(PLACING, null);
    expect([...h.movable]).toEqual([]);
    expect([...h.targets]).toEqual([
      ['a2', 'a2'],
      ['c3', 'c3'],
      ['e4', 'e4'],
    ]);
  });

  test('tapping a target places a goat; anything else does nothing', () => {
    expect(tap(PLACING, null, 'c3')).toEqual({ selected: null, move: 'c3' });
    expect(tap(PLACING, null, 'b1')).toEqual({ selected: null, move: null });
  });
});

describe('moving pieces', () => {
  test('pieces with a legal move are movable; the selection shows its targets', () => {
    expect([...highlights(MOVING, null).movable].sort()).toEqual(['a1', 'c3', 'e5']);
    expect(highlights(MOVING, null).targets.size).toBe(0);
    expect([...highlights(MOVING, 'c3').targets]).toEqual([
      ['c5', 'c3xc5'],
      ['d3', 'c3-d3'],
    ]);
  });

  test('select, then move', () => {
    const first = tap(MOVING, null, 'a1');
    expect(first).toEqual({ selected: 'a1', move: null });
    expect(tap(MOVING, first.selected, 'b2')).toEqual({ selected: null, move: 'a1-b2' });
  });

  test('tapping another movable piece switches; the same piece or elsewhere clears', () => {
    expect(tap(MOVING, 'a1', 'c3')).toEqual({ selected: 'c3', move: null });
    expect(tap(MOVING, 'a1', 'a1')).toEqual({ selected: null, move: null });
    expect(tap(MOVING, 'a1', 'd4')).toEqual({ selected: null, move: null });
    expect(tap(MOVING, null, 'd4')).toEqual({ selected: null, move: null });
  });

  test('nothing to do once the game is over', () => {
    expect(tap([], null, 'a1')).toEqual({ selected: null, move: null });
  });
});

test('movePoints', () => {
  expect(movePoints(undefined)).toEqual([]);
  expect(movePoints('c3')).toEqual(['c3']);
  expect(movePoints('a1-b2')).toEqual(['a1', 'b2']);
  expect(movePoints('a1xc3')).toEqual(['a1', 'c3']);
});
