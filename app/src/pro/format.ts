/** Words for private rooms, tournaments and the trainer (the Pro extras). */
import type {
  Pairing,
  Room,
  Tournament,
  Trainer,
  TrainerAnswer,
  TrainerPuzzle,
} from '@/api/endpoints';

const SIDE_NAMES = { goat: 'goats', tiger: 'tigers' } as const;

/** A link to share, on the web; elsewhere just the path. */
export function shareLink(
  path: string,
  origin: string | undefined = (globalThis as { location?: { origin?: string } }).location?.origin,
): string {
  return origin === undefined ? path : `${origin}${path}`;
}

/** "5+3 casual game · you play goats" (for the host). */
export function roomText(room: Room): string {
  const side =
    room.host_side === 'random'
      ? 'sides drawn at random'
      : `you play ${SIDE_NAMES[room.host_side]}`;
  return `${room.time_control} casual game · ${side}`;
}

/** "alice invites you to a 5+3 casual game. alice plays goats; you play tigers." */
export function invitationText(room: Room): string {
  const who = room.host.username;
  const sides =
    room.host_side === 'random'
      ? 'Sides are drawn at random.'
      : `${who} plays ${SIDE_NAMES[room.host_side]}; you play ${room.host_side === 'goat' ? 'tigers' : 'goats'}.`;
  return `${who} invites you to a ${room.time_control} casual game. ${sides}`;
}

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
