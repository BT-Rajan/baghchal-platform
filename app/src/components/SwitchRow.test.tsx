import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '@/theme';

import { SwitchRow } from './SwitchRow';

/** The platform's switch inside the row (hidden from screen readers, who reach the row). */
const control = () => screen.getAllByRole('switch', { includeHiddenElements: true })[1]!;

test('one switch, named by its label, in the theme colours; the row and the switch both toggle', async () => {
  const onChange = jest.fn();
  const { rerender } = await render(
    <SwitchRow label="Game sounds" value={false} onChange={onChange} />,
  );
  const row = screen.getByRole('switch', { name: 'Game sounds' });
  expect(row).not.toBeChecked();
  // iOS's switch takes the track as tint colours.
  expect(control().props).toMatchObject({ onTintColor: colors.ink, tintColor: colors.muted });
  expect(control().props.thumbTintColor).toBe(colors.surface);
  await fireEvent.press(row);
  expect(onChange).toHaveBeenLastCalledWith(true);

  await rerender(<SwitchRow label="Game sounds" value onChange={onChange} />);
  expect(screen.getByRole('switch', { name: 'Game sounds' })).toBeChecked();
  expect(control().props.thumbTintColor).toBe(colors.inkText);
  await fireEvent(control(), 'change', { nativeEvent: { value: false } });
  expect(onChange).toHaveBeenLastCalledWith(false);
});
