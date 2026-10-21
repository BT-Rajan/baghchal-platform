/** Words for tournaments and the trainer (the Pro extras, and the daily puzzle for everyone). */
import type { Pairing, Tournament, Trainer, TrainerAnswer, TrainerPuzzle } from '@/api/endpoints';
import { plural, t } from '@/i18n';

/** "Waiting for players: 2 of 8", "Round 2 of 4 · 1 of 3 games played", "Finished after 4 rounds". */
export function tournamentStatusText(tour: Tournament): string {
  if (tour.status === 'open')
    return t('Waiting for players: {count} of {max}', {
      count: tour.players.length,
      max: tour.max_players,
    });
  if (tour.status === 'finished') {
    return plural(tour.round, 'Finished after {count} round', 'Finished after {count} rounds');
  }
  const current = tour.pairings.filter((p) => p.round === tour.round);
  const done = current.filter((p) => p.state === 'done').length;
  return plural(
    current.length,
    'Round {round} of {rounds} · {done} of {count} game played',
    'Round {round} of {rounds} · {done} of {count} games played',
    { round: tour.round, rounds: tour.rounds, done },
  );
}

/** The rounds played so far, newest first: each round's games and its bye, if any. */
export function roundsOf(t: Tournament): { round: number; games: Pairing[]; bye: string | null }[] {
  const rounds = [...new Set(t.pairings.map((p) => p.round).concat(t.byes.map((b) => b.round)))];
  return rounds
    .sort((a, b) => b - a)
    .map((round) => ({
      round,
      games: t.pairings.filter((p) => p.round === round),
      bye: t.byes.find((b) => b.round === round)?.player.username ?? null,
    }));
}

/** "alice (goats) v bob (tigers) · won by bob" */
export function pairingText(p: Pairing): string {
  const who = t('{goat} (goats) v {tiger} (tigers)', {
    goat: p.goat.username,
    tiger: p.tiger.username,
  });
  const winner = p.winner?.username;
  const state =
    p.state === 'waiting'
      ? t('to play')
      : p.state === 'playing'
        ? t('playing now')
        : winner === undefined
          ? p.forfeit
            ? t('won by nobody (no game)')
            : t('won by nobody')
          : p.forfeit
            ? t('won by {name} (no game)', { name: winner })
            : t('won by {name}', { name: winner });
  return `${who} · ${state}`;
}

export function isMine(p: Pairing, myId: string): boolean {
  return p.goat.id === myId || p.tiger.id === myId;
}

/** "Goats to play: find the best move." */
export function puzzlePrompt(puzzle: TrainerPuzzle): string {
  return puzzle.side === 'goat'
    ? t('Goats to play: find the best move.')
    : t('Tigers to play: find the best move.');
}

export function answerText(answer: Pick<TrainerAnswer, 'correct' | 'best'>): string {
  return answer.correct
    ? t('Correct! That is the best move, shown on the board.')
    : t('Not quite. The best move was {move}, shown on the board.', { move: answer.best });
}

/** "Daily streak: 3 days", or null before there is one. */
export function dailyStreakText(days: number): string | null {
  if (days === 0) return null;
  return plural(days, 'Daily streak: {count} day', 'Daily streak: {count} days');
}

/** "Solved 12 of 60 · In a row: 3" */
export function progressText(progress: Pick<Trainer, 'solved' | 'total' | 'streak'>): string {
  return t('Solved {solved} of {total} · In a row: {count}', {
    solved: progress.solved,
    total: progress.total,
    count: progress.streak,
  });
}
