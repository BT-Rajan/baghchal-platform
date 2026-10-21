import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { AGREED, error } from './support/fakeServer';

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

describe('a confirmation email that went missing', () => {
  test('can be sent again from the sign-up confirmation, which leads to sign in', async () => {
    const { server, app } = await renderApp('/sign-up', {
      routes: {
        'POST /api/v1/auth/register': { status: 202, body: { status: 'accepted' } },
        'POST /api/v1/auth/verify-email/resend': { status: 202, body: { status: 'accepted' } },
      },
    });
    await screen.findByRole('button', { name: 'Accept and create account', busy: false });
    await type('Username', 'alice');
    await type('Email', 'alice@example.com');
    await type('Password', 'correct horse');
    await press('Accept and create account');
    await fireEvent.press(await screen.findByRole('button', { name: 'Send the link again' }));
    expect(server.lastTo('POST /api/v1/auth/register').body).toMatchObject(AGREED);
    expect(await screen.findByText(/^We sent a new link to alice@example\.com/)).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/verify-email/resend').body).toEqual({
      email: 'alice@example.com',
    });
    await press('Sign in');
    await waitFor(() => expect(app.getPathname()).toBe('/sign-in'));
  });

  test('can be sent again from sign in, with the email address', async () => {
    const { server } = await renderApp('/sign-in', {
      routes: {
        'POST /api/v1/auth/login': error(403, 'email_not_verified', 'Please verify first.'),
        'POST /api/v1/auth/verify-email/resend': error(429, 'rate_limited', 'Slow down.'),
      },
    });
    await screen.findByRole('heading', { name: 'Sign in' });
    await type('Username or email', 'alice');
    await type('Password', 'correct horse');
    await press('Sign in');
    expect(await screen.findByText(/^Did the email not come\?/)).toBeOnTheScreen();
    await type('Username or email', 'alice@example.com');
    await press('Sign in');
    await fireEvent.press(await screen.findByRole('button', { name: 'Send the link again' }));
    expect(await screen.findByText('Slow down.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/verify-email/resend').body).toEqual({
      email: 'alice@example.com',
    });
  });
});
