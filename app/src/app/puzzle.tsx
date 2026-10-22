import { DailyPuzzle } from '@/components/DailyPuzzle';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';

/** Today's puzzle on its own screen, in the apps (from the play menu). */
export default function PuzzleScreen() {
  return (
    <Screen title={t('Daily puzzle')} align="top" refreshable>
      <DailyPuzzle alone />
    </Screen>
  );
}
