/** Quick messages in a game: a few set phrases, never free text. */
import type { Emote, Game } from '@/api/endpoints';

export const EMOTES: readonly { value: Emote; label: string }[] = [
  { value: 'good_luck', label: 'Good luck!' },
  { value: 'good_move', label: 'Good move!' },
  { value: 'oops', label: 'Oops!' },
  { value: 'thanks', label: 'Thanks!' },
  { value: 'well_played', label: 'Well played!' },
];

/** How long a quick message shows on the player's bar. */
export const EMOTE_SHOWN_MS = 4_000;

export function emoteText(emote: Emote): string {
  return EMOTES.find((e) => e.value === emote)?.label ?? '';
}

/** How long after a game ends quick messages can still be sent (the server says the same). */
export const EMOTES_AFTER_MS = 5 * 60_000;

/** Whether quick messages can be sent in this game now (by the server's clock). */
export function emotesOpen(game: Game, serverNowMs: number): boolean {
  if (game.computer !== null) return false;
  if (game.finished_at === null) return game.status === 'active';
  return serverNowMs - Date.parse(game.finished_at) < EMOTES_AFTER_MS;
}
