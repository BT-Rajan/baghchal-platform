import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { colors, control, radius, type } from '@/theme';

beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
afterEach(() => jest.restoreAllMocks());

test('buttons are Android pills, 40 tall, with a 48 touch area', async () => {
  await render(<Button title="Undo" variant="secondary" onPress={() => {}} />);
  const button = screen.getByRole('button', { name: 'Undo' });
  const style = StyleSheet.flatten(button.props.style);
  expect(style).toMatchObject({ minHeight: 40, borderRadius: radius.pill });
  expect(button.props.hitSlop).toBe(4);
  expect(StyleSheet.flatten(screen.getByText('Undo').props.style)).toMatchObject({
    fontSize: 14,
    fontWeight: '500',
  });
});

test("a screen's main action is a large pill, 56 tall, with bigger text", async () => {
  await render(
    <>
      <Button title="Play now" onPress={() => {}} />
      <Button title="Settings" variant="secondary" large onPress={() => {}} />
      <Button title="Accept" compact onPress={() => {}} />
    </>,
  );
  for (const name of ['Play now', 'Settings']) {
    expect(StyleSheet.flatten(screen.getByRole('button', { name }).props.style)).toMatchObject({
      minHeight: control.large,
      borderRadius: radius.pill,
    });
    expect(StyleSheet.flatten(screen.getByText(name).props.style)).toMatchObject({
      fontSize: type.bigAction.fontSize,
    });
  }
  // A compact primary, in a list row, stays small.
  expect(
    StyleSheet.flatten(screen.getByRole('button', { name: 'Accept' }).props.style).minHeight,
  ).toBe(control.android);
});

test('text fields are 56 tall and focus in the brand colour', async () => {
  await render(<TextField label="Username" value="" onChangeText={() => {}} />);
  const input = screen.getByLabelText('Username');
  expect(StyleSheet.flatten(input.props.style)).toMatchObject({ minHeight: 56, borderRadius: 4 });
  expect(input.props.cursorColor).toBe(colors.accent);
  await fireEvent(input, 'focus');
  expect(StyleSheet.flatten(screen.getByLabelText('Username').props.style).borderColor).toBe(
    colors.accent,
  );
  expect(StyleSheet.flatten(screen.getByText('Username').props.style).color).toBe(colors.accent);
});

test('small controls get a 48 touch area', async () => {
  await render(
    <>
      <IconButton icon="sound" title="Sound" onPress={() => {}} />
      <Segmented
        label="Game"
        options={[{ value: 'a', label: 'A' }]}
        value="a"
        onChange={() => {}}
      />
    </>,
  );
  expect(
    StyleSheet.flatten(screen.getByRole('button', { name: 'Sound' }).props.style),
  ).toMatchObject({ minWidth: 48, minHeight: 48 });
  expect(StyleSheet.flatten(screen.getByRole('radio', { name: 'A' }).props.style).minHeight).toBe(
    48,
  );
});
