import { game } from '../../tests/support/games';

import { EMOTES, emoteText, emotesOpen } from './emotes';

test('the set phrases', () => {
  expect(EMOTES.map((e) => e.label)).toEqual([
    'Good luck!',
    'Good move!',
    'Oops!',
    'Thanks!',
    'Well played!',
  ]);
  expect(emoteText('oops')).toBe('Oops!');
  expect(emoteText('nonsense' as never)).toBe('');
});

test('when quick messages can be sent', () => {
  const end = Date.parse('2026-01-01T12:00:00Z');
  expect(emotesOpen(game(), end)).toBe(true);
  expect(emotesOpen(game({ computer: 'easy' }), end)).toBe(false);
  const over = game({ status: 'finished', finished_at: '2026-01-01T12:00:00Z' });
  expect(emotesOpen(over, end + 4 * 60_000)).toBe(true);
  expect(emotesOpen(over, end + 6 * 60_000)).toBe(false);
  expect(emotesOpen(game({ status: 'finished' }), end)).toBe(false);
});
