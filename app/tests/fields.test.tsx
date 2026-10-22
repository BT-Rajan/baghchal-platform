import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, TextInput } from 'react-native';

import { TextField } from '@/components/TextField';

import { renderApp } from './support/app';
import { LINK_TOKEN, ME } from './support/fakeServer';

afterEach(() => jest.restoreAllMocks());

/** Which fields were focused, by their labels, in order. */
function focusing() {
  const focus = jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus');
  // The mock's own focus is shared by every field, and keeps its calls between tests.
  focus.mockClear();
  return () =>
    focus.mock.contexts.map(
      (field) => (field as { props: { 'aria-label': string } }).props['aria-label'],
    );
}

describe('a password field', () => {
  test('shows what was typed, and hides it again', async () => {
    await render(
      <TextField label="Password" value="hunter22" onChangeText={() => {}} secureTextEntry />,
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.props['aria-pressed']).toBe(false);
    await fireEvent.press(toggle);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Show password' }).props['aria-pressed']).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  test('other fields have no such button', async () => {
    await render(<TextField label="Username" value="" onChangeText={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
  });
});

describe('Enter goes to the next field', () => {
  test('choosing a new password', async () => {
    const focused = focusing();
    await renderApp(`/reset-password?token=${LINK_TOKEN}`);
    const first = await screen.findByLabelText('New password');
    expect(first.props).toMatchObject({ returnKeyType: 'next', submitBehavior: 'submit' });
    await fireEvent(first, 'submitEditing');
    expect(focused()).toEqual(['Repeat the new password']);
    expect(screen.getByLabelText('Repeat the new password').props.returnKeyType).toBe('go');
  });

  test("changing the account's email address", async () => {
    const focused = focusing();
    await renderApp('/settings/email', {
      token: 'tok',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    await fireEvent(await screen.findByLabelText('New email address'), 'submitEditing');
    expect(focused()).toEqual(['Your password']);
  });

  test("changing the account's password", async () => {
    const focused = focusing();
    await renderApp('/settings/password', {
      token: 'tok',
      routes: { 'GET /api/v1/me': { status: 200, body: ME } },
    });
    await fireEvent(await screen.findByLabelText('Current password'), 'submitEditing');
    await fireEvent(screen.getByLabelText('New password'), 'submitEditing');
    expect(focused()).toEqual(['New password', 'Repeat the new password']);
    expect(screen.getByLabelText('Repeat the new password').props.returnKeyType).toBe('go');
  });
});

describe("a new account's details are offered to autofill as new", () => {
  test('on Android, a new username and a new password', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderApp('/sign-up');
    expect((await screen.findByLabelText('Username')).props.autoComplete).toBe('username-new');
    // React Native gives Android "password-new" for it.
    expect(screen.getByLabelText('Password').props.autoComplete).toBe('new-password');
  });

  test('elsewhere, the standard names', async () => {
    await renderApp('/sign-up');
    expect((await screen.findByLabelText('Username')).props.autoComplete).toBe('username');
    expect(screen.getByLabelText('Password').props.autoComplete).toBe('new-password');
  });
});
