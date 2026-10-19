import { game } from '../../tests/support/games';

import { firstMoveSecondsLeft, formatClock, remainingMs } from './clock';

const T0 = Date.parse('2026-01-01T12:00:00Z');

describe('remainingMs', () => {
  const running = game({
    ply: 4,
    clocks: { goat_ms: 120_000, tiger_ms: 90_000, running: 'tiger' },
    server_time: '2026-01-01T12:00:00Z',
  });

  test('the running clock counts down from server_time; the other stands', () => {
    expect(remainingMs(running, 'tiger', T0 + 2_500)).toBe(87_500);
    expect(remainingMs(running, 'goat', T0 + 2_500)).toBe(120_000);
  });

  test('never below zero, and never above the reported value', () => {
    expect(remainingMs(running, 'tiger', T0 + 100_000)).toBe(0);
    expect(remainingMs(running, 'tiger', T0 - 5_000)).toBe(90_000);
  });

  test('with the sand clock, what one side spends the other gains', () => {
    const sand = {
      ...running,
      time_control: 'sand',
      clocks: { goat_ms: 50_000, tiger_ms: 70_000, running: 'tiger' as const },
    };
    expect(remainingMs(sand, 'tiger', T0 + 10_000)).toBe(60_000);
    expect(remainingMs(sand, 'goat', T0 + 10_000)).toBe(60_000);
    // Never more than the other side had to give.
    expect(remainingMs(sand, 'goat', T0 + 100_000)).toBe(120_000);
    const goats = { ...sand, clocks: { ...sand.clocks, running: 'goat' as const } };
    expect(remainingMs(goats, 'tiger', T0 + 10_000)).toBe(80_000);
    const before = { ...sand, clocks: { ...sand.clocks, running: null } };
    expect(remainingMs(before, 'goat', T0 + 10_000)).toBe(50_000);
  });

  test('a finished game shows its final clocks', () => {
    const over = { ...running, status: 'finished' as const };
    expect(remainingMs(over, 'tiger', T0 + 2_500)).toBe(90_000);
  });
});

test('formatClock', () => {
  expect(formatClock(300_000)).toBe('5:00');
  expect(formatClock(245_001)).toBe('4:06');
  expect(formatClock(59_500)).toBe('1:00');
  expect(formatClock(10_000)).toBe('0:10');
  expect(formatClock(9_950)).toBe('0:09.9');
  expect(formatClock(420)).toBe('0:00.4');
  expect(formatClock(-5)).toBe('0:00.0');
});

test('firstMoveSecondsLeft', () => {
  const opening = game({ ply: 1, deadline_at: '2026-01-01T12:00:30Z' });
  expect(firstMoveSecondsLeft(opening, T0 + 4_200)).toBe(26);
  expect(firstMoveSecondsLeft(opening, T0 + 40_000)).toBe(0);
  expect(firstMoveSecondsLeft({ ...opening, ply: 2 }, T0)).toBeNull();
  expect(firstMoveSecondsLeft({ ...opening, deadline_at: null }, T0)).toBeNull();
  expect(firstMoveSecondsLeft({ ...opening, status: 'finished' }, T0)).toBeNull();
});
