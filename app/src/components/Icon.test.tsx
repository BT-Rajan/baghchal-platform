import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nManager, Platform, Text } from 'react-native';

import * as i18n from '@/i18n';

import { Disclosure } from './Disclosure';
import { Icon, layoutIsRTL, type IconName } from './Icon';

afterEach(() => jest.restoreAllMocks());

/** The arrow's path, and the x of its bar if it has one. */
async function drawn(name: IconName) {
  const json = JSON.stringify((await render(<Icon name={name} color="#000" />)).toJSON());
  return [json.match(/"d":"([^"]+)"/)?.[1], json.match(/"x1":(\d+)/)?.[1] ?? null];
}

test('arrows point onward, and back, the way the layout runs', async () => {
  expect(await drawn('next')).toEqual(['M9 5 16 12 9 19', null]);
  expect(await drawn('chevron')).toEqual(['M9 5 16 12 9 19', null]);
  expect(await drawn('previous')).toEqual(['M15 5 8 12 15 19', null]);
  expect(await drawn('first')).toEqual(['M17 5 10 12 17 19', '6']);
  expect(await drawn('last')).toEqual(['M7 5 14 12 7 19', '18']);

  jest.replaceProperty(I18nManager, 'isRTL', true);
  expect(layoutIsRTL()).toBe(true);
  expect(await drawn('next')).toEqual(['M15 5 8 12 15 19', null]);
  expect(await drawn('previous')).toEqual(['M9 5 16 12 9 19', null]);
  expect(await drawn('first')).toEqual(['M7 5 14 12 7 19', '18']);
  expect(await drawn('last')).toEqual(['M17 5 10 12 17 19', '6']);
});

test('in the apps the layout in effect counts, not a language chosen until the restart', () => {
  jest.spyOn(i18n, 'isRTL').mockReturnValue(true);
  expect(layoutIsRTL()).toBe(false);
  jest.replaceProperty(Platform, 'OS', 'web');
  expect(layoutIsRTL()).toBe(true);
});

test("a disclosure's chevron turns down the same way", async () => {
  jest.replaceProperty(I18nManager, 'isRTL', true);
  const { toJSON } = await render(
    <Disclosure title="More">
      <Text>Inside</Text>
    </Disclosure>,
  );
  expect(JSON.stringify(toJSON())).not.toContain('rotate');
  await fireEvent.press(screen.getByRole('button', { name: 'More' }));
  expect(JSON.stringify(toJSON())).toContain('{"rotate":"-90deg"}');
});

test('the eye for showing a password, struck through for hiding it', async () => {
  const eye = JSON.stringify((await render(<Icon name="eye" color="#000" />)).toJSON());
  const off = JSON.stringify((await render(<Icon name="eye-off" color="#000" />)).toJSON());
  expect(eye).toContain('RNSVGCircle');
  expect(eye).not.toContain('RNSVGLine');
  expect(off).toContain('"x1":3,"y1":3,"x2":21,"y2":21');
});
