/** Words for achievements. */
import { dayText } from './format';
import type { Achievement } from '@/api/endpoints';

export const ACHIEVEMENTS: Record<Achievement['key'], { name: string; text: string }> = {
  first_win: { name: 'First win', text: 'Win a game.' },
  goat_win: { name: 'Shepherd', text: 'Win a game with the goats.' },
  tiger_win: { name: 'Hunter', text: 'Win a game with the tigers.' },
  trapped: { name: 'Trapper', text: 'Win by trapping the tigers.' },
  five_captures: { name: 'Feast', text: 'Win by capturing five goats.' },
  beat_medium: { name: 'Sharp', text: 'Beat the Medium computer.' },
  beat_hard: { name: 'Master', text: 'Beat the Hard computer.' },
  rated_10: { name: 'Regular', text: 'Finish ten rated games.' },
  puzzle_streak_7: { name: 'Puzzler', text: 'Solve the daily puzzle seven days in a row.' },
};

/** "4 of 9 earned". */
export function achievementCount(list: readonly Achievement[]): string {
  return `${list.filter((a) => a.earned_at !== null).length} of ${list.length} earned`;
}

/** "Earned 3 Oct 2026". */
export function earnedText(iso: string): string {
  return `Earned ${dayText(iso)}`;
}
