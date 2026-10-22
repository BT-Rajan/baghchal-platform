import { fireEvent, render, screen } from '@testing-library/react-native';

import type { GameAction } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { GameActions } from '@/components/game/GameActions';

import { game } from './support/games';

// Nobody to watch for before both sides have moved: the opponent's presence is not asked.
jest.mock('@/lobby/hooks', () => ({
  ...jest.requireActual('@/lobby/hooks'),
  useProfile: () => ({ data: undefined, dataUpdatedAt: 0, refetch: jest.fn() }),
}));

const REFUSED = new ApiError(409, 'abort_limit', 'You have aborted 3 games today.');

function actions(pending: GameAction | null, error: unknown, onAction = jest.fn()) {
  return (
    <GameActions game={game()} me="goat" pending={pending} error={error} onAction={onAction} />
  );
}

test('in the apps, aborting asks over the button, stays open while busy and after a failure, and closes once done', async () => {
  const onAction = jest.fn();
  await render(actions(null, null, onAction));
  await fireEvent.press(screen.getByRole('button', { name: 'Abort game' }));
  expect(
    screen.getByRole('alertdialog', { name: 'Abort? It counts toward your 3 a day.' }),
  ).toBeOnTheScreen();
  // The button that asked is still drawn behind the dialog.
  expect(
    screen.getByRole('button', { name: 'Abort game', includeHiddenElements: true }),
  ).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Abort' }));
  expect(onAction).toHaveBeenCalledWith('abort');
  // Not closed by answering: busy while the server is asked...
  await screen.rerender(actions('abort', null, onAction));
  expect(screen.getByRole('alertdialog')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Abort' })).toBeDisabled();
  // ...and showing why, when it fails.
  await screen.rerender(actions(null, REFUSED, onAction));
  expect(screen.getByRole('alertdialog')).toBeOnTheScreen();
  expect(screen.getByText('You have aborted 3 games today.')).toBeOnTheScreen();

  // Trying again, and it goes through: the dialog closes.
  await fireEvent.press(screen.getByRole('button', { name: 'Abort' }));
  await screen.rerender(actions('abort', null, onAction));
  expect(screen.queryByText('You have aborted 3 games today.')).toBeNull();
  await screen.rerender(actions(null, null, onAction));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Abort game' })).toBeOnTheScreen();
});

test('resigning asks over the panel, which stays; Keep playing closes it', async () => {
  const onAction = jest.fn();
  await render(
    <GameActions
      game={game({ ply: 4, side_to_move: 'goat' })}
      me="goat"
      pending={null}
      onAction={onAction}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
  expect(screen.getByRole('alertdialog', { name: 'Resign?' })).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Offer a draw', includeHiddenElements: true }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep playing' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(onAction).not.toHaveBeenCalled();
});
