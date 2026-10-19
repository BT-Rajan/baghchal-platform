import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Me } from '@/api/endpoints';

import { renderApp } from './support/app';
import { AGREED, ME, error } from './support/fakeServer';

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

/** A guest under 18: plays the computer, and nobody was asked to agree. */
const YOUNG_GUEST = {
  ...ME,
  username: 'guest-3fa9c1',
  email: 'guest-3fa9c1@guest.invalid',
  role: 'guest' as const,
  plays_people: false,
  parent_consent: 'pending' as const,
};

/** An account under 18 whose parent has yet to answer. */
const WAITING = { ...ME, plays_people: false, parent_consent: 'pending' as const };

function as(me: Me, url: string, routes = {}) {
  return renderApp(url, {
    token: 'tok',
    routes: { 'GET /api/v1/me': { status: 200, body: me }, ...routes },
  });
}

describe('a player who may not play people yet', () => {
  test('a young guest is told what they can do, and nobody claims a parent was emailed', async () => {
    await as(YOUNG_GUEST, '/');
    expect(await screen.findByText(/^You are playing as guest-3fa9c1/)).toBeOnTheScreen();
    expect(screen.queryByText(/We emailed your parent/)).toBeNull();
  });

  test('quick pairing, challenges and hosting explain why they are closed', async () => {
    await as(WAITING, '/play');
    expect(
      await screen.findByText(/^A parent or guardian has to agree before you play other people/),
    ).toBeOnTheScreen();
    // Playing the computer is still there.
    expect(screen.getByRole('button', { name: /computer/i })).toBeOnTheScreen();
    await as(YOUNG_GUEST, '/invite');
    expect(await screen.findByText(/^Under 18, a guest can play the computer/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Make the link' })).toBeNull();
  });
});

describe('making an account as a young guest', () => {
  test('asks only for a parent, and says they were emailed', async () => {
    let me: Me = YOUNG_GUEST;
    const { server } = await as(YOUNG_GUEST, '/claim', {
      'GET /api/v1/me': () => ({ status: 200, body: me }),
      'POST /api/v1/me/claim': () => {
        me = { ...WAITING, username: 'Sita' };
        return { status: 200, body: me };
      },
    });
    await screen.findByRole('button', { name: 'Make my account', busy: false });
    expect(screen.queryByLabelText('Month of birth')).toBeNull();
    await type('Username', 'Sita');
    await type('Email', 'sita@example.com');
    await type('Password', 'correct horse');
    await press('Make my account');
    expect(screen.getByText("Enter your parent's or guardian's email address.")).toBeOnTheScreen();
    await type("Parent's or guardian's email", 'ma@example.com');
    await press('Make my account');
    expect(await screen.findByText(/^We also emailed ma@example\.com/)).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/me/claim').body).toMatchObject({
      parent_email: 'ma@example.com',
    });
    expect(server.lastTo('POST /api/v1/me/claim').body).not.toHaveProperty('birth_month');
  });
});

describe('a confirmation email that went missing', () => {
  test('can be sent again from the sign-up confirmation, which leads to sign in', async () => {
    const { server, app } = await renderApp('/sign-up', {
      routes: {
        'POST /api/v1/auth/register': { status: 202, body: { status: 'accepted' } },
        'POST /api/v1/auth/verify-email/resend': { status: 202, body: { status: 'accepted' } },
      },
    });
    await screen.findByRole('button', { name: 'Create account', busy: false });
    await type('Username', 'alice');
    await type('Email', 'alice@example.com');
    await type('Password', 'correct horse');
    await type('Month of birth', '1');
    await type('Year of birth', '1990');
    await press('Create account');
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
