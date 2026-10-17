import { BACKOFF_CAP_MS, backoffDelay } from './backoff';

test('grows exponentially, with jitter, up to a cap', () => {
  expect(backoffDelay(0, () => 0)).toBe(500);
  expect(backoffDelay(0, () => 1)).toBe(1_000);
  expect(backoffDelay(3, () => 1)).toBe(8_000);
  expect(backoffDelay(10, () => 1)).toBe(BACKOFF_CAP_MS);
  expect(backoffDelay(1_000, () => 1)).toBe(BACKOFF_CAP_MS);
  expect(backoffDelay(10, () => 0)).toBe(500);
});

test('uses Math.random by default', () => {
  const delay = backoffDelay(2);
  expect(delay).toBeGreaterThanOrEqual(500);
  expect(delay).toBeLessThanOrEqual(4_000);
});
