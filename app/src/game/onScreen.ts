/**
 * Which game's screen is in front, if any: the app opens a newly started game for me unless
 * the screen in front leads to it itself (game 1 of a match counts down to game 2).
 */
let shown: string | null = null;

/** Mark a game's screen as in front; returns how to unmark it (when it loses focus). */
export function showingGame(id: string): () => void {
  shown = id;
  return () => {
    if (shown === id) shown = null;
  };
}

/** Whether a game that just started is opened by the screen in front rather than for me. */
export function openedFromScreen(game: {
  match?: { game: number; games: string[] } | null;
}): boolean {
  return game.match?.game === 2 && game.match.games[0] === shown;
}
