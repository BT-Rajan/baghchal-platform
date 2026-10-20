import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { Confirm } from '@/components/Confirm';

afterEach(() => jest.restoreAllMocks());

function ask() {
  const answers = { confirm: jest.fn(), cancel: jest.fn() };
  return {
    answers,
    element: (
      <Confirm
        question="Resign this game?"
        confirmTitle="Resign"
        onConfirm={answers.confirm}
        onCancel={answers.cancel}
      />
    ),
  };
}

test('in the apps, a dialog: answer, or cancel with back or a tap outside', async () => {
  const { answers, element } = ask();
  await render(element);
  expect(screen.getByRole('alert')).toHaveTextContent(/Resign this game\?/);
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
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Resign this game?')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(answers.cancel).toHaveBeenCalledTimes(1);
});
