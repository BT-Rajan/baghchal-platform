import { ApiError, NETWORK_ERROR } from './errors';
import { shouldRetry } from './retry';

test('retries network trouble and server errors twice', () => {
  const network = new ApiError(0, NETWORK_ERROR, '');
  expect(shouldRetry(0, network)).toBe(true);
  expect(shouldRetry(1, new ApiError(503, 'http_error', ''))).toBe(true);
  expect(shouldRetry(1, new Error('x'))).toBe(true);
  expect(shouldRetry(2, network)).toBe(false);
});

test('never retries client errors', () => {
  expect(shouldRetry(0, new ApiError(404, 'game_not_found', ''))).toBe(false);
  expect(shouldRetry(0, new ApiError(401, 'not_authenticated', ''))).toBe(false);
});
