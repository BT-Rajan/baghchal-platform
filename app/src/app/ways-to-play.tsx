import { PlayModes } from '@/components/PlayModes';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';

/**
 * The apps' play menu, from home's "Play now": every way to play, each a row to its own
 * screen. (The web's home shows them as tiles.)
 */
export default function WaysToPlay() {
  return (
    <Screen title={t('Play now')} align="top">
      <PlayModes />
    </Screen>
  );
}
