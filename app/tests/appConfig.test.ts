/** app.config.ts: what the Android build is given (links that open the app, its version). */
import { linkFilters, versionCode } from '../app.config';

test("the website's https links open the app, verified", () => {
  const [filter] = linkFilters('https://clawplay.example');
  expect(filter).toMatchObject({ action: 'VIEW', autoVerify: true });
  expect(filter?.data).toContainEqual({
    scheme: 'https',
    host: 'clawplay.example',
    pathPrefix: '/c/',
  });
  expect(filter?.data).toContainEqual({
    scheme: 'https',
    host: 'clawplay.example',
    path: '/verify-email',
  });
  expect(linkFilters('https://clawplay.example:8443')[0]?.data).toContainEqual({
    scheme: 'https',
    host: 'clawplay.example',
    port: '8443',
    pathPrefix: '/tournament/',
  });
});

test('a plain-http website (a test server) keeps its links in the browser', () => {
  expect(linkFilters('http://169.58.13.213:7070')).toEqual([]);
  expect(linkFilters(undefined)).toEqual([]);
  expect(linkFilters('not a url')).toEqual([]);
});

test("each build's version code comes from the build, 1 by default", () => {
  expect(versionCode(undefined)).toBe(1);
  expect(versionCode('')).toBe(1);
  expect(versionCode('42')).toBe(42);
  expect(() => versionCode('0')).toThrow(/whole number/);
  expect(() => versionCode('4.2')).toThrow(/whole number/);
});
