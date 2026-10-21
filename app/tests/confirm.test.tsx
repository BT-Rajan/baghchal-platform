import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ApiError } from '@/api/errors';
import { Confirm } from '@/components/Confirm';

afterEach(() => jest.restoreAllMocks());

function ask(more: { busy?: boolean; error?: unknown } = {}) {
  const answers = { confirm: jest.fn(), cancel: jest.fn() };
  return {
    answers,
    element: (
      <Confirm
        question="Resign this game?"
        confirmTitle="Resign"
        onConfirm={answers.confirm}
        onCancel={answers.cancel}
        {...more}
      />
    ),
  };
}

const REFUSED = new ApiError(409, 'game_over', 'The game is already over.');

test('in the apps, a dialog: answer, or cancel with back or a tap outside', async () => {
  const { answers, element } = ask();
  await render(element);
  expect(screen.getByRole('alertdialog', { name: 'Resign this game?' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Resign' }));
  expect(answers.confirm).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('scrim')); // a tap outside
  await fireEvent(screen.getByTestId('dialog'), 'requestClose'); // Android's back button
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(answers.cancel).toHaveBeenCalledTimes(3);
});

test('on the web, in place of the button that asked', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const { answers, element } = ask();
  await render(element);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByText('Resign this game?')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(answers.cancel).toHaveBeenCalledTimes(1);
});

test('in the apps, while busy nothing dismisses it; a failure shows in the dialog', async () => {
  const { answers, element } = ask({ busy: true, error: REFUSED });
  await render(element);
  expect(screen.getByText('The game is already over.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('scrim'));
  await fireEvent(screen.getByTestId('dialog'), 'requestClose');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(answers.cancel).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled();
});

test('on the web, a failure shows with the question; Cancel waits while busy', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const { answers, element } = ask({ busy: true, error: REFUSED });
  await render(element);
  expect(screen.getByText('The game is already over.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(answers.cancel).not.toHaveBeenCalled();
});
