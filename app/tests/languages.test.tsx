import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { I18nManager } from 'react-native';

import { renderApp } from './support/app';
import { ME } from './support/fakeServer';

import type { Appearance } from '@/api/endpoints';
import { FREE_APPEARANCE } from '@/appearance/catalog';
import { CATALOGS, setLanguage } from '@/i18n';

let mockDeviceTags = ['en-IN'];
jest.mock('expo-localization', () => ({
  useLocales: () => mockDeviceTags.map((languageTag) => ({ languageTag })),
}));

const URL = '/api/v1/me/appearance';

function open(url: string, appearance: Appearance = FREE_APPEARANCE) {
  let saved = appearance;
  return renderApp(url, {
    token: 'tok',
    routes: {
      'GET /api/v1/me': { status: 200, body: ME },
      'GET /api/v1/blocks': { status: 200, body: [] },
      [`GET ${URL}`]: () => ({ status: 200, body: saved }),
      [`PATCH ${URL}`]: (request) => {
        saved = { ...saved, ...(request.body as Partial<Appearance>) };
        return { status: 200, body: saved };
      },
    },
  });
}

/** The text in a language, or the English while the catalog lacks it. */
const inLanguage = (language: 'ta' | 'hi' | 'ar', english: string) =>
  (CATALOGS[language][english] as string | undefined) ?? english;

afterEach(() => {
  mockDeviceTags = ['en-IN'];
  setLanguage('en');
  jest.restoreAllMocks();
});

test('the language is chosen in Settings and kept with the appearance', async () => {
  const { server, app } = await open('/settings');
  expect(await screen.findByRole('radio', { name: 'As this device (English)' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'தமிழ்' }));
  await waitFor(() => expect(server.lastTo(`PATCH ${URL}`).body).toEqual({ language: 'ta' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'தமிழ்' })).toBeChecked());
  expect(screen.getByText(inLanguage('ta', 'Language'))).toBeOnTheScreen();
  // Only the screen is drawn again, in its place: the app does not start over.
  expect(app.getPathname()).toBe('/settings');
  // From now on the server answers in Tamil too.
  await waitFor(() => expect(server.requests.at(-1)?.headers['Accept-Language']).toBe('ta'));
});

test("the device's language is used until one is chosen", async () => {
  mockDeviceTags = ['fr-FR', 'hi-IN'];
  const { server } = await open('/settings');
  expect(
    await screen.findByRole('radio', {
      name: inLanguage('hi', 'As this device ({language})').replace('{language}', 'हिन्दी'),
    }),
  ).toBeChecked();
  expect(server.requests.at(-1)?.headers['Accept-Language']).toBe('hi');
});

test('Arabic turns the layout around, from the next start in the apps', async () => {
  const forceRTL = jest.spyOn(I18nManager, 'forceRTL');
  await open('/settings', { ...FREE_APPEARANCE, language: 'ar' });
  await waitFor(() => expect(forceRTL).toHaveBeenLastCalledWith(true));
  expect(
    await screen.findByText(
      inLanguage('ar', 'Close and open ClawPlay again to update the layout.'),
    ),
  ).toBeOnTheScreen();
});
