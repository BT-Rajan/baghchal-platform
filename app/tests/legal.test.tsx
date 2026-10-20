import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { AGREED, LEGAL, LINK_TOKEN, ME, error, type FakeRequest } from './support/fakeServer';

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

/** A year that makes someone born in January of it `age` this year (after their birthday). */
const bornAged = (age: number) => String(new Date().getFullYear() - age - 1);

describe('signing up under 18', () => {
  async function fill(year: string) {
    await screen.findByRole('button', { name: 'Create account', busy: false });
    await type('Username', 'sita');
    await type('Email', 'sita@example.com');
    await type('Password', 'correct horse');
    await type('Month of birth', '1');
    await type('Year of birth', year);
  }

  test('asks for a parent, who is not the player, and sends their address', async () => {
    const { server } = await renderApp('/sign-up', {
      routes: { 'POST /api/v1/auth/register': { status: 202, body: { status: 'accepted' } } },
    });
    await fill(bornAged(15));
    expect(screen.getByText(/^You are under 18, so we will email a parent/)).toBeOnTheScreen();
    await press('Create account');
    expect(screen.getByText("Enter your parent's or guardian's email address.")).toBeOnTheScreen();
    await type("Parent's or guardian's email", 'nope');
    await press('Create account');
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    await type("Parent's or guardian's email", ' SITA@example.com');
    await press('Create account');
    expect(
      screen.getByText("Enter your parent's or guardian's address, not your own."),
    ).toBeOnTheScreen();
    await type("Parent's or guardian's email", ' ma@example.com ');
    await press('Create account');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/register').body).toMatchObject({
      birth_month: `${bornAged(15)}-01`,
      parent_email: 'ma@example.com',
    });
  });

  test('the server’s word on the age lands by the field', async () => {
    await renderApp('/sign-up', {
      routes: {
        'POST /api/v1/auth/register': error(403, 'too_young', 'You must be at least 13.'),
      },
    });
    await fill('1990');
    await type('Month of birth', '13');
    await press('Create account');
    expect(screen.getByText('Please check your month and year of birth.')).toBeOnTheScreen();
    await type('Month of birth', '1');
    await press('Create account');
    expect(await screen.findByText('You must be at least 13.')).toBeOnTheScreen();
  });

  test('a sign-up waits for the versions, and says when they cannot be had', async () => {
    await renderApp('/sign-up', {
      routes: { 'GET /api/v1/legal': error(429, 'rate_limited', 'Try again soon.') },
    });
    expect(await screen.findByText('Try again soon.')).toBeOnTheScreen();
  });
});

describe('the terms and privacy policy', () => {
  test('are drawn from the server’s text, for anyone', async () => {
    const { app } = await renderApp('/sign-up', {
      routes: {
        'GET /api/v1/legal/terms': {
          status: 200,
          body: {
            document: 'terms',
            version: LEGAL.terms,
            text: '# Terms\n\nPlay **fair**.\n\n## Accounts\n\n- One each\n- Be kind',
          },
        },
      },
    });
    await fireEvent.press(await screen.findByRole('link', { name: 'Terms of service' }));
    await waitFor(() => expect(app.getPathname()).toBe('/terms'));
    expect(await screen.findByRole('heading', { name: 'Terms' })).toBeOnTheScreen();
    expect(screen.getByText('fair')).toBeOnTheScreen();
    // Each section is shut until opened: its heading holds the button.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const accounts = screen.getByRole('button', { name: 'Accounts', expanded: false });
    await fireEvent.press(accounts);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Accounts', expanded: true }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(`Version of ${LEGAL.terms}`)).toBeOnTheScreen();
  });

  test('a privacy policy that fails to load can be asked for again', async () => {
    let fail = true;
    const { app } = await renderApp('/settings', {
      token: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: ME },
        'GET /api/v1/legal/privacy': () =>
          fail
            ? error(429, 'rate_limited', 'Try again soon.')
            : {
                status: 200,
                body: { document: 'privacy', version: LEGAL.privacy, text: '# Privacy' },
              },
      },
    });
    await fireEvent.press(await screen.findByRole('link', { name: 'Privacy policy' }));
    await waitFor(() => expect(app.getPathname()).toBe('/privacy'));
    expect(await screen.findByText('Try again soon.')).toBeOnTheScreen();
    fail = false;
    await press('Try again');
    expect(await screen.findByRole('heading', { name: 'Privacy' })).toBeOnTheScreen();
  });
});

describe('an account with something to agree to', () => {
  function asking(me: typeof ME, onAccept: (request: FakeRequest) => void) {
    let current = me;
    return renderApp('/', {
      token: 'tok',
      routes: {
        'GET /api/v1/me': () => ({ status: 200, body: current }),
        'POST /api/v1/me/consents': (request) => {
          onAccept(request);
          current = ME;
          return { status: 200, body: current };
        },
      },
    });
  }

  test('gives its age before playing on', async () => {
    const sent: unknown[] = [];
    const { app } = await asking({ ...ME, age_needed: true, consents_needed: ['terms'] }, (r) =>
      sent.push(r.body),
    );
    expect(await screen.findByRole('heading', { name: 'Before you play on' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/agree');
    await screen.findByRole('button', { name: 'Continue', busy: false });
    await press('Continue');
    expect(screen.getByText('Enter the month and year you were born.')).toBeOnTheScreen();
    await type('Month of birth', '1');
    await type('Year of birth', '1990');
    await press('Continue');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(sent).toEqual([AGREED]);
  });

  test('agrees to changed terms, without its age asked again', async () => {
    const sent: unknown[] = [];
    await asking({ ...ME, consents_needed: ['privacy'] }, (r) => sent.push(r.body));
    expect(await screen.findByText(/^We have updated our terms/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Month of birth')).toBeNull();
    await screen.findByRole('button', { name: 'Continue', busy: false });
    await press('Continue');
    await waitFor(() =>
      expect(sent).toEqual([{ terms_version: LEGAL.terms, privacy_version: LEGAL.privacy }]),
    );
  });

  test('can sign out instead', async () => {
    const { app } = await asking({ ...ME, age_needed: true }, () => undefined);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(app.getPathname()).toBe('/welcome'));
  });
});

test('a player waiting for a parent is told why they cannot play people', async () => {
  await renderApp('/', {
    token: 'tok',
    routes: {
      'GET /api/v1/me': {
        status: 200,
        body: { ...ME, plays_people: false, parent_consent: 'pending' },
      },
    },
  });
  expect(await screen.findByText(/^We emailed your parent or guardian\./)).toBeOnTheScreen();
});

describe('a parent’s link', () => {
  const PENDING = { username: 'sita', status: 'pending', adult_from: '2030-02-01' };

  test('a malformed link is refused without asking the server', async () => {
    const { server } = await renderApp('/parent-consent?token=short');
    expect(await screen.findByText('This link is invalid or has expired.')).toBeOnTheScreen();
    expect(server.requests.filter((r) => r.path.startsWith('/api/v1/parent'))).toHaveLength(0);
  });

  test('an expired link says so', async () => {
    await renderApp(`/parent-consent?token=${LINK_TOKEN}`, {
      routes: {
        'POST /api/v1/parent-consent/look-up': error(400, 'invalid_token', 'This link expired.'),
      },
    });
    expect(await screen.findByText('This link expired.')).toBeOnTheScreen();
  });

  test('agreeing lets the player play people; withdrawing deletes the account', async () => {
    const decisions: unknown[] = [];
    let status = 'pending';
    const { server } = await renderApp(`/parent-consent?token=${LINK_TOKEN}`, {
      routes: {
        'POST /api/v1/parent-consent/look-up': { status: 200, body: PENDING },
        'POST /api/v1/parent-consent': (request) => {
          decisions.push(request.body);
          const { decision } = request.body as { decision: string };
          if (decision === 'agree' && status === 'pending') {
            status = 'given';
            return { status: 200, body: { ...PENDING, status } };
          }
          if (decision === 'agree') return error(429, 'rate_limited', 'Try again soon.');
          return { status: 200, body: { ...PENDING, status: 'deleted' } };
        },
      },
    });
    expect(await screen.findByText(/^sita made a ClawPlay account/)).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/parent-consent/look-up').body).toEqual({
      token: LINK_TOKEN,
    });
    await press('I agree');
    expect(await screen.findByText(/^You agreed: sita can play other people/)).toBeOnTheScreen();
    await press('Withdraw my agreement');
    await press('Cancel');
    await press('Withdraw my agreement');
    await press('Delete the account');
    expect(
      await screen.findByRole('heading', { name: 'The account is deleted' }),
    ).toBeOnTheScreen();
    expect(decisions).toEqual([
      { token: LINK_TOKEN, decision: 'agree' },
      { token: LINK_TOKEN, decision: 'refuse' },
    ]);
  });

  test('a decision that fails is shown', async () => {
    await renderApp(`/parent-consent?token=${LINK_TOKEN}`, {
      routes: {
        'POST /api/v1/parent-consent/look-up': { status: 200, body: PENDING },
        'POST /api/v1/parent-consent': error(429, 'rate_limited', 'Try again soon.'),
      },
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'I do not agree' }));
    await press('Delete the account');
    expect(await screen.findByText('Try again soon.')).toBeOnTheScreen();
  });
});
