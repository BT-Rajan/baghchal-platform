/** Client-side checks that mirror the server's rules, so most mistakes get a clear message early. */

export type Problems<F extends string> = Partial<Record<F, string>>;

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export function usernameProblem(username: string): string | undefined {
  if (username === '') return 'Choose a username.';
  if (!USERNAME.test(username)) {
    return '3–20 letters, digits, _ or -, starting with a letter or digit.';
  }
  return undefined;
}

export function emailProblem(email: string): string | undefined {
  if (email === '') return 'Enter your email address.';
  if (email.length > 254 || !EMAIL.test(email)) return 'Enter a valid email address.';
  return undefined;
}

export function passwordProblem(password: string, username = ''): string | undefined {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (username !== '' && password.toLowerCase() === username.toLowerCase()) {
    return 'Your password must not be your username.';
  }
  return undefined;
}

function only<F extends string>(problems: Record<F, string | undefined>): Problems<F> {
  const found: Problems<F> = {};
  for (const key of Object.keys(problems) as F[]) {
    const problem = problems[key];
    if (problem !== undefined) found[key] = problem;
  }
  return found;
}

export function checkSignUp(form: { username: string; email: string; password: string }) {
  return only({
    username: usernameProblem(form.username),
    email: emailProblem(form.email.trim()),
    password: passwordProblem(form.password, form.username),
  });
}

export function checkSignIn(form: { login: string; password: string }) {
  return only({
    login: form.login.trim() === '' ? 'Enter your username or email.' : undefined,
    password: form.password === '' ? 'Enter your password.' : undefined,
  });
}

export function checkNewPassword(form: { password: string; confirm: string }) {
  return only({
    password: passwordProblem(form.password),
    confirm: form.confirm !== form.password ? 'The passwords do not match.' : undefined,
  });
}

export function checkPasswordChange(
  form: { current: string; password: string; confirm: string },
  username: string,
) {
  return only({
    current: form.current === '' ? 'Enter your current password.' : undefined,
    password: passwordProblem(form.password, username),
    confirm: form.confirm !== form.password ? 'The passwords do not match.' : undefined,
  });
}

export function checkEmailChange(form: { email: string; password: string }, current: string) {
  const email = form.email.trim();
  return only({
    email:
      emailProblem(email) ??
      (email.toLowerCase() === current.toLowerCase()
        ? 'That is already your email address.'
        : undefined),
    password: form.password === '' ? 'Enter your password.' : undefined,
  });
}

export function checkPasswordGiven(form: { password: string }) {
  return only({ password: form.password === '' ? 'Enter your password.' : undefined });
}

export function checkEmail(form: { email: string }) {
  return only({ email: emailProblem(form.email.trim()) });
}

/** Single-use tokens from emailed links: 43 URL-safe base64 characters. */
export function isLinkToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
