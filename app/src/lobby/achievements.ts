/** Words for achievements (each name and text shown with `t()`). */
import { dayText } from './format';
import type { Achievement } from '@/api/endpoints';
import { mark, t } from '@/i18n';

export const ACHIEVEMENTS: Record<Achievement['key'], { name: string; text: string }> = {
  first_win: { name: mark('First win'), text: mark('Win a game.') },
  goat_win: { name: mark('Shepherd'), text: mark('Win a game with the goats.') },
  tiger_win: { name: mark('Hunter'), text: mark('Win a game with the tigers.') },
  trapped: { name: mark('Trapper'), text: mark('Win by trapping the tigers.') },
  five_captures: { name: mark('Feast'), text: mark('Win by capturing five goats.') },
  beat_medium: { name: mark('Sharp'), text: mark('Beat the Medium computer.') },
  beat_hard: { name: mark('Master'), text: mark('Beat the Hard computer.') },
  rated_10: { name: mark('Regular'), text: mark('Finish ten rated games.') },
  puzzle_streak_7: {
    name: mark('Puzzler'),
    text: mark('Solve the daily puzzle seven days in a row.'),
  },
};

/** "4 of 9 earned". */
export function achievementCount(list: readonly Achievement[]): string {
  return t('{earned} of {total} earned', {
    earned: list.filter((a) => a.earned_at !== null).length,
    total: list.length,
  });
}

/** "Earned 3 Oct 2026". */
export function earnedText(iso: string): string {
  return t('Earned {date}', { date: dayText(iso) });
}
