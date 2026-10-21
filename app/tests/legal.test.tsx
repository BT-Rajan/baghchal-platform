import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderApp } from './support/app';
import { AGREED, LEGAL, ME, error, type FakeRequest } from './support/fakeServer';

async function press(name: string | RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

describe('signing up', () => {
  test('the button accepts the terms, and says so', async () => {
    const { server } = await renderApp('/sign-up', {
      routes: { 'POST /api/v1/auth/register': { status: 202, body: { status: 'accepted' } } },
    });
    await screen.findByRole('button', { name: 'Accept and make my account', busy: false });
    expect(screen.getByText(/^By pressing Accept you agree to our /)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Month of birth')).toBeNull();
    await type('Username', 'sita');
    await type('Email', 'sita@example.com');
    await type('Password', 'correct horse');
    await press('Accept and make my account');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/register').body).toEqual({
      ...AGREED,
      username: 'sita',
      email: 'sita@example.com',
      password: 'correct horse',
    });
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
    expect(await screen.findByText('fair')).toBeOnTheScreen();
    // In the apps the header bar names the document: its own title is not repeated.
    expect(screen.queryByRole('heading', { name: 'Terms' })).toBeNull();
    // Each section is shut until opened: its heading holds the button.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const accounts = screen.getByRole('button', { name: 'Accounts', expanded: false });
    await fireEvent.press(accounts);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Accounts', expanded: true }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/^Updated \d+ \w+ \d{4}$/)).toBeOnTheScreen();
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
    expect(await screen.findByText(/^Updated /)).toBeOnTheScreen();
  });
});

describe('an account whose terms changed', () => {
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

  test('accepts them before playing on', async () => {
    const sent: unknown[] = [];
    const { app } = await asking({ ...ME, consents_needed: ['privacy'] }, (r) => sent.push(r.body));
    expect(await screen.findByText('Our terms or privacy policy have changed.')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/agree');
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeOnTheScreen();
    expect(screen.getByText(/^By pressing Accept you agree to our /)).toBeOnTheScreen();
    await screen.findByRole('button', { name: 'Accept', busy: false });
    await press('Accept');
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(sent).toEqual([AGREED]);
  });

  test('a refusal is shown', async () => {
    await renderApp('/', {
      token: 'tok',
      routes: {
        'GET /api/v1/me': { status: 200, body: { ...ME, consents_needed: ['terms'] } },
        'POST /api/v1/me/consents': error(409, 'legal_outdated', 'The terms changed again.'),
      },
    });
    await screen.findByRole('button', { name: 'Accept', busy: false });
    await press('Accept');
    expect(await screen.findByText('The terms changed again.')).toBeOnTheScreen();
  });

  test('can sign out instead', async () => {
    const { app } = await asking({ ...ME, consents_needed: ['terms'] }, () => undefined);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(app.getPathname()).toBe('/welcome'));
  });

  test('changed while playing: the refused request brings the agreement at once', async () => {
    let current = ME;
    const { app } = await renderApp('/player/bob', {
      token: 'tok',
      routes: {
        'GET /api/v1/me': () => ({ status: 200, body: current }),
        'GET /api/v1/players/bob': () => {
          current = { ...ME, consents_needed: ['terms'] };
          return error(403, 'consents_needed', 'Please accept the updated terms first.');
        },
      },
    });
    expect(await screen.findByText('Our terms or privacy policy have changed.')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/agree');
  });
});
