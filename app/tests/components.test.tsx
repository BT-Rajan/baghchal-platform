import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { Board } from '@/components/Board';
import { ChallengeCard } from '@/components/lobby';
import { PlayerBar } from '@/components/PlayerBar';

import { ALICE, challenge, game, testQueryClient } from './fixtures';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Link: ({ children }: { children: ReactNode }) => children,
}));

const mockRespond = jest.fn();
jest.mock('@/services', () => ({
  api: { respond: (...args: unknown[]) => mockRespond(...args) },
}));
jest.mock('@/auth/session', () => ({
  useMe: () => ({ ...jest.requireActual('./fixtures').BOB, email: 'b@x', created_at: '' }),
}));

async function showBoard(props: Partial<React.ComponentProps<typeof Board>> = {}) {
  const onMove = jest.fn();
  const utils = await render(
    <Board position="T3T/5/5/5/T3T g 20 0" legalMoves={['a2', 'b1']} onMove={onMove} {...props} />,
  );
  await fireEvent(screen.getByTestId('board'), 'layout', {
    nativeEvent: { layout: { width: 300 } },
  });
  return { ...utils, onMove };
}

describe('Board', () => {
  it('draws the position with labelled points', async () => {
    await showBoard({ lastMove: 'a2' });
    expect(screen.getByLabelText('a1, tiger')).toBeTruthy();
    expect(screen.getByLabelText('a2, empty, place a goat here')).toBeTruthy();
    expect(screen.getByLabelText('c3, empty')).toBeTruthy();
  });

  it('places a goat with one tap', async () => {
    const { onMove } = await showBoard();
    await fireEvent.press(screen.getByTestId('point-a2'));
    expect(onMove).toHaveBeenCalledWith('a2');
    await fireEvent.press(screen.getByTestId('point-c3'));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('moves a tiger by picking it up and putting it down', async () => {
    const { onMove } = await showBoard({
      position: 'T3T/5/5/1G3/T3T t 19 0',
      legalMoves: ['a1-a2', 'a1-b1', 'a1xc3', 'e1-d1'],
      lastMove: 'b2',
    });
    await fireEvent.press(screen.getByTestId('point-a1'));
    expect(screen.getByLabelText('a1, tiger, selected')).toBeTruthy();
    expect(screen.getByLabelText('c3, empty, capture here')).toBeTruthy();
    expect(screen.getByLabelText('a2, empty, move here')).toBeTruthy();
    expect(screen.getByLabelText('e1, tiger, can move')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('point-c3'));
    expect(onMove).toHaveBeenCalledWith('a1xc3');
  });

  it('forgets the selection when the position changes', async () => {
    const props = { legalMoves: ['a1-a2'], onMove: jest.fn() };
    const { rerender } = await render(<Board position="T3T/5/5/5/T3T t 19 0" {...props} />);
    await fireEvent(screen.getByTestId('board'), 'layout', {
      nativeEvent: { layout: { width: 300 } },
    });
    await fireEvent.press(screen.getByTestId('point-a1'));
    expect(screen.getByLabelText('a1, tiger, selected')).toBeTruthy();
    await rerender(<Board position="T3T/5/5/G4/T3T t 18 0" {...props} />);
    expect(screen.getByLabelText('a1, tiger, can move')).toBeTruthy();
  });

  it('accepts no moves while disabled', async () => {
    const { onMove } = await showBoard({ disabled: true });
    await fireEvent.press(screen.getByTestId('point-a2'));
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByLabelText('a2, empty')).toBeTruthy();
  });
});

describe('PlayerBar', () => {
  it('shows the running clock counting down and rating changes', async () => {
    const g = game({
      rated: true,
      clocks: { goat_ms: 65_000, tiger_ms: 9_000, running: 'tiger' },
      side_to_move: 'tiger',
      ratings: { goat: { rating: 1500, change: -8 }, tiger: { rating: 1510, change: 8 } },
    });
    const now = Date.parse(g.server_time) + 2_000;
    await render(<PlayerBar game={g} side="tiger" serverNow={now} />);
    expect(screen.getByLabelText('bob clock 7.0')).toBeTruthy();
    expect(screen.getByText('Tigers · 1510 (+8)')).toBeTruthy();
    await render(<PlayerBar game={g} side="goat" serverNow={now} />);
    expect(screen.getByLabelText('alice clock 1:05')).toBeTruthy();
    expect(screen.getByText('Goats · 1500 (-8)')).toBeTruthy();
  });
});

describe('ChallengeCard', () => {
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>
  );

  it('lets the opponent accept, and opens the new game', async () => {
    const { router } = jest.requireMock('expo-router');
    const c = challenge({ side: 'goat' });
    mockRespond.mockResolvedValueOnce({ ...c, status: 'accepted', game_id: 'g1' });
    const now = Date.parse(c.expires_at) - 30_000;
    await render(wrap(<ChallengeCard challenge={c} now={now} />));
    expect(
      screen.getByText(/alice challenges you · 5\+3 · Casual, alice plays goats/),
    ).toBeTruthy();
    expect(screen.getByText('Expires in 30s')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    expect(mockRespond).toHaveBeenCalledWith(c.id, 'accept');
    expect(router.navigate).toHaveBeenCalledWith('/game/g1');
  });

  it('lets the challenger cancel', async () => {
    const c = challenge({
      challenger: { id: 'b2222222-0000-0000-0000-000000000000', username: 'bob' },
      opponent: ALICE,
      rated: true,
      side: null,
    });
    mockRespond.mockResolvedValueOnce({ ...c, status: 'cancelled' });
    await render(wrap(<ChallengeCard challenge={c} now={Date.parse(c.expires_at) + 1} />));
    expect(screen.getByText(/You challenged alice · 5\+3 · Rated match/)).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockRespond).toHaveBeenCalledWith(c.id, 'cancel');
  });
});
