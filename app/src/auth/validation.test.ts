import {
  PASSWORD_MAX,
  checkEmail,
  checkEmailChange,
  checkNewPassword,
  checkPasswordChange,
  checkPasswordGiven,
  checkSignIn,
  checkSignUp,
  emailProblem,
  isLinkToken,
  passwordProblem,
  usernameProblem,
} from './validation';

test.each([
  ['', 'Choose a username.'],
  ['ab', /3–20/],
  ['_alice', /3–20/],
  ['a'.repeat(21), /3–20/],
  ['al ice', /3–20/],
  ['alice', undefined],
  ['A1_-z', undefined],
])('usernameProblem(%p)', (username, expected) => {
  const problem = usernameProblem(username);
  if (expected === undefined) expect(problem).toBeUndefined();
  else expect(problem).toMatch(expected);
});

test.each([
  ['', 'Enter your email address.'],
  ['alice', 'Enter a valid email address.'],
  ['a@b', 'Enter a valid email address.'],
  [`${'a'.repeat(250)}@b.co`, 'Enter a valid email address.'],
  ['alice@example.com', undefined],
])('emailProblem(%p)', (email, expected) => {
  expect(emailProblem(email)).toBe(expected);
});

test('passwordProblem', () => {
  expect(passwordProblem('short')).toMatch(/at least 10/);
  expect(passwordProblem('x'.repeat(PASSWORD_MAX + 1))).toMatch(/at most 128/);
  expect(passwordProblem('aliceAlice', 'ALICEalice')).toMatch(/not be your username/);
  expect(passwordProblem('aliceAlice', '')).toBeUndefined();
  expect(passwordProblem('correct horse')).toBeUndefined();
});

test('checkSignUp reports only fields with problems, trimming the email', () => {
  expect(
    checkSignUp({ username: 'alice', email: ' a@example.com ', password: 'long enough!' }),
  ).toEqual({});
  expect(checkSignUp({ username: '', email: 'x', password: '' })).toEqual({
    username: 'Choose a username.',
    email: 'Enter a valid email address.',
    password: 'Use at least 10 characters.',
  });
});

test('checkSignIn', () => {
  expect(checkSignIn({ login: ' ', password: '' })).toEqual({
    login: 'Enter your username or email.',
    password: 'Enter your password.',
  });
  expect(checkSignIn({ login: 'alice', password: 'x' })).toEqual({});
});

test('checkNewPassword', () => {
  expect(checkNewPassword({ password: 'long enough!', confirm: 'long enough?' })).toEqual({
    confirm: 'The passwords do not match.',
  });
  expect(checkNewPassword({ password: 'long enough!', confirm: 'long enough!' })).toEqual({});
});

test('checkEmail', () => {
  expect(checkEmail({ email: '' })).toEqual({ email: 'Enter your email address.' });
  expect(checkEmail({ email: 'a@example.com ' })).toEqual({});
});

test('isLinkToken', () => {
  expect(isLinkToken('A_-'.repeat(14) + 'z')).toBe(true);
  expect(isLinkToken('a'.repeat(42))).toBe(false);
  expect(isLinkToken('a'.repeat(42) + '!')).toBe(false);
  expect(isLinkToken(['a'.repeat(43)])).toBe(false);
  expect(isLinkToken(undefined)).toBe(false);
});

test('checkPasswordChange', () => {
  expect(checkPasswordChange({ current: '', password: 'short', confirm: 'x' }, 'alice')).toEqual({
    current: 'Enter your current password.',
    password: 'Use at least 10 characters.',
    confirm: 'The passwords do not match.',
  });
  expect(
    checkPasswordChange(
      { current: 'c', password: 'AliceAlice', confirm: 'AliceAlice' },
      'alicealice',
    ),
  ).toEqual({ password: 'Your password must not be your username.' });
  expect(
    checkPasswordChange({ current: 'c', password: 'long enough!', confirm: 'long enough!' }, 'a'),
  ).toEqual({});
});

test('checkEmailChange', () => {
  expect(checkEmailChange({ email: '', password: '' }, 'a@example.com')).toEqual({
    email: 'Enter your email address.',
    password: 'Enter your password.',
  });
  expect(checkEmailChange({ email: ' A@Example.com ', password: 'p' }, 'a@example.com')).toEqual({
    email: 'That is already your email address.',
  });
  expect(checkEmailChange({ email: 'b@example.com', password: 'p' }, 'a@example.com')).toEqual({});
});

test('checkPasswordGiven', () => {
  expect(checkPasswordGiven({ password: '' })).toEqual({ password: 'Enter your password.' });
  expect(checkPasswordGiven({ password: 'x' })).toEqual({});
});
