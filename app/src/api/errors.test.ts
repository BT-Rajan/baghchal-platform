import {
  ApiError,
  BAD_RESPONSE,
  NETWORK_ERROR,
  TIMEOUT,
  describeError,
  errorFromBody,
  formErrors,
  isApiError,
} from './errors';

describe('errorFromBody', () => {
  test('reads the server envelope, with field problems', () => {
    const error = errorFromBody(422, {
      error: {
        code: 'invalid_request',
        message: 'Invalid request.',
        fields: [{ field: 'email', problem: 'bad' }, { field: 1 }, 'junk'],
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'invalid_request',
      message: 'Invalid request.',
    });
    expect(error.fields).toEqual([{ field: 'email', problem: 'bad' }]);
    expect(error.name).toBe('ApiError');
  });

  test('ignores fields that are not a list', () => {
    expect(errorFromBody(400, { error: { code: 'x', message: 'y', fields: 'no' } }).fields).toEqual(
      [],
    );
  });

  test.each([undefined, null, [], 'text', { error: 'nope' }, { error: { code: 1, message: 'm' } }])(
    'falls back for an unexpected body: %p',
    (body) => {
      expect(errorFromBody(502, body)).toMatchObject({ status: 502, code: 'http_error' });
    },
  );
});

test('isApiError matches the class and, optionally, the code', () => {
  const error = new ApiError(409, 'player_busy', 'Busy.');
  expect(isApiError(error)).toBe(true);
  expect(isApiError(error, 'player_busy')).toBe(true);
  expect(isApiError(error, 'game_over')).toBe(false);
  expect(isApiError(new Error('x'))).toBe(false);
});

test.each([
  [new ApiError(0, NETWORK_ERROR, ''), /reach the server/],
  [new ApiError(0, TIMEOUT, ''), /too long/],
  [new ApiError(200, BAD_RESPONSE, ''), /did not understand/],
  [new ApiError(422, 'invalid_request', ''), /^Please check what you entered\.$/],
  [
    new ApiError(422, 'invalid_request', '', [{ field: 'username', problem: 'bad' }]),
    /highlighted fields/,
  ],
  [new ApiError(409, 'username_taken', 'That username is taken.'), /^That username is taken\.$/],
  [new Error('boom'), /Something went wrong/],
  ['not even an error', /Something went wrong/],
])('describeError(%p)', (error, message) => {
  expect(describeError(error)).toMatch(message);
});

describe('formErrors', () => {
  const FIELDS = ['username', 'password'] as const;

  test('puts an error code on the field it is about', () => {
    const error = new ApiError(409, 'username_taken', 'That username is taken.');
    expect(formErrors(error, FIELDS, { username_taken: 'username' })).toEqual({
      fields: { username: 'That username is taken.' },
      message: null,
    });
  });

  test('places field problems, first problem per field wins', () => {
    const error = new ApiError(422, 'invalid_request', 'Invalid request.', [
      { field: 'username', problem: 'first' },
      { field: 'username', problem: 'second' },
    ]);
    expect(formErrors(error, FIELDS)).toEqual({ fields: { username: 'first' }, message: null });
  });

  test('reports problems with unknown fields for the whole form', () => {
    const error = new ApiError(422, 'invalid_request', 'Invalid request.', [
      { field: 'transport', problem: 'bad' },
    ]);
    // Nothing on the form is highlighted, so the message does not point at highlights.
    expect(formErrors(error, FIELDS)).toEqual({
      fields: {},
      message: 'Please check what you entered.',
    });
  });

  test('points at the highlighted fields when some are, and others are not on the form', () => {
    const error = new ApiError(422, 'invalid_request', 'Invalid request.', [
      { field: 'username', problem: 'bad' },
      { field: 'transport', problem: 'bad' },
    ]);
    expect(formErrors(error, FIELDS)).toEqual({
      fields: { username: 'bad' },
      message: 'Please check the highlighted fields.',
    });
  });

  test('reports other errors for the whole form', () => {
    expect(formErrors(new ApiError(429, 'rate_limited', 'Too many.'), FIELDS)).toEqual({
      fields: {},
      message: 'Too many.',
    });
    expect(formErrors(new Error('x'), FIELDS).message).toMatch(/Something went wrong/);
  });
});
