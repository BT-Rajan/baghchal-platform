/** Words for tournaments and the trainer (the Pro extras). */
import type { Pairing, Tournament, Trainer, TrainerAnswer, TrainerPuzzle } from '@/api/endpoints';

/** "Waiting for players: 2 of 6", "4 of 12 games played", "Finished". */
export function tournamentStatusText(t: Tournament): string {
  if (t.status === 'open') return `Waiting for players: ${t.players.length} of ${t.max_players}`;
  const done = t.pairings.filter((p) => p.state === 'done').length;
  const played = `${done} of ${t.pairings.length} games played`;
  return t.status === 'running' ? played : `Finished · ${played}`;
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

export function answerText(answer: TrainerAnswer): string {
  return answer.correct
    ? 'Correct! That is the best move.'
    : `Not quite. The best move was ${answer.best}.`;
}

/** "Solved 12 of 60 · Streak 3" */
export function progressText(progress: Pick<Trainer, 'solved' | 'total' | 'streak'>): string {
  return `Solved ${progress.solved} of ${progress.total} · Streak ${progress.streak}`;
}
