import { ServerClock, serverClock } from './serverClock';

test('uses local time until it hears from the server', () => {
  const clock = new ServerClock(() => 1_000);
  expect(clock.offset()).toBe(0);
  expect(clock.now()).toBe(1_000);
});

test('takes the largest recent lower bound of the offset', () => {
  let local = Date.parse('2026-01-01T12:00:00.000Z');
  const clock = new ServerClock(() => local);
  // The server is 5 s ahead; messages spend 300 ms and then 40 ms in transit.
  clock.observe(new Date(local + 5_000 - 300).toISOString());
  expect(clock.offset()).toBe(4_700);
  local += 1_000;
  clock.observe(new Date(local + 5_000 - 40).toISOString());
  expect(clock.offset()).toBe(4_960);
  expect(clock.now()).toBe(local + 4_960);
  clock.observe('not a time');
  expect(clock.offset()).toBe(4_960);
  clock.reset();
  expect(clock.offset()).toBe(0);
});

test('forgets old samples, so a changed device clock is followed', () => {
  let local = 0;
  const clock = new ServerClock(() => local);
  clock.observe(new Date(10_000).toISOString()); // offset +10 s
  for (let i = 0; i < 10; i++) {
    local = 100_000 + i;
    clock.observe(new Date(local).toISOString()); // now in step
  }
  expect(clock.offset()).toBe(0);
});

test('there is one shared clock, on local time by default', () => {
  expect(serverClock).toBeInstanceOf(ServerClock);
  expect(Math.abs(new ServerClock().now() - Date.now())).toBeLessThan(1_000);
});
