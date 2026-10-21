import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { colors, radius } from '@/theme';

beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
afterEach(() => jest.restoreAllMocks());

test('buttons are Android pills, 40 tall, with a 48 touch area', async () => {
  await render(<Button title="Play now" onPress={() => {}} />);
  const button = screen.getByRole('button', { name: 'Play now' });
  const style = StyleSheet.flatten(button.props.style);
  expect(style).toMatchObject({ minHeight: 40, borderRadius: radius.pill });
  expect(button.props.hitSlop).toBe(4);
  expect(StyleSheet.flatten(screen.getByText('Play now').props.style)).toMatchObject({
    fontSize: 14,
    fontWeight: '500',
  });
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
