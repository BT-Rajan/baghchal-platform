/** Words for tournaments and the trainer (the Pro extras, and the daily puzzle for everyone). */
import type { Pairing, Tournament, Trainer, TrainerAnswer, TrainerPuzzle } from '@/api/endpoints';

/** "Waiting for players: 2 of 8", "Round 2 of 4 · 1 of 3 games played", "Finished after 4 rounds". */
export function tournamentStatusText(t: Tournament): string {
  if (t.status === 'open') return `Waiting for players: ${t.players.length} of ${t.max_players}`;
  if (t.status === 'finished') {
    return `Finished after ${t.round} ${t.round === 1 ? 'round' : 'rounds'}`;
  }
  const current = t.pairings.filter((p) => p.round === t.round);
  const done = current.filter((p) => p.state === 'done').length;
  return `Round ${t.round} of ${t.rounds} · ${done} of ${current.length} games played`;
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
  const who = `${p.goat.username} (goats) v ${p.tiger.username} (tigers)`;
  const state =
    p.state === 'waiting'
      ? 'to play'
      : p.state === 'playing'
        ? 'playing now'
        : `won by ${p.winner?.username ?? 'nobody'}`;
  return `${who} · ${state}`;
}

export function isMine(p: Pairing, myId: string): boolean {
  return p.goat.id === myId || p.tiger.id === myId;
}

/** "Goats to play: find the best move." */
export function puzzlePrompt(puzzle: TrainerPuzzle): string {
  return `${puzzle.side === 'goat' ? 'Goats' : 'Tigers'} to play: find the best move.`;
}

export function answerText(answer: Pick<TrainerAnswer, 'correct' | 'best'>): string {
  return answer.correct
    ? 'Correct! That is the best move.'
    : `Not quite. The best move was ${answer.best}.`;
}

/** "Daily streak: 3 days", or null before there is one. */
export function dailyStreakText(days: number): string | null {
  if (days === 0) return null;
  return `Daily streak: ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** "Solved 12 of 60 · Streak 3" */
export function progressText(progress: Pick<Trainer, 'solved' | 'total' | 'streak'>): string {
  return `Solved ${progress.solved} of ${progress.total} · Streak ${progress.streak}`;
}
