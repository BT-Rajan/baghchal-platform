import { apiUrlProblem } from './apiUrl';

test.each([
  ['https://api.example.com', true],
  ['https://api.example.com:8443/base', true],
  ['http://localhost:8000', true],
  ['http://127.0.0.1:8000', true],
  ['http://[::1]:8000', true],
  ['http://192.168.1.20:8000', false],
  ['https://192.168.1.20:8000', true],
])('%s is fine in development', (url) => {
  expect(apiUrlProblem(url, false)).toBeNull();
});

test.each(['https://api.example.com', 'http://localhost:8000', 'http://127.0.0.1:8000'])(
  '%s is fine in production',
  (url) => {
    expect(apiUrlProblem(url, true)).toBeNull();
  },
);

test.each([
  ['http://api.example.com', /must use https in production builds/],
  ['http://192.168.1.20:8000', /must use https in production builds/],
  ['ftp://api.example.com', /must use https/],
  ['javascript:alert(1)', /must use https/],
  ['https://user:secret@api.example.com', /must not contain credentials/],
  ['api.example.com', /is not a URL/],
])('%s is refused in production', (url, problem) => {
  expect(apiUrlProblem(url, true)).toMatch(problem);
});

test('credentials and other schemes are refused in development too', () => {
  expect(apiUrlProblem('https://user@api.example.com', false)).toMatch(/credentials/);
  expect(apiUrlProblem('ws://api.example.com', false)).toMatch(/must use https/);
});
