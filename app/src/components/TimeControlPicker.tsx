import type { TimeControl } from '@/api/endpoints';
import { t } from '@/i18n';
import { SAND_CLOCK_TEXT, TIME_CONTROLS, timeControlName } from '@/lobby/format';

import { Hint } from './Card';
import { Segmented } from './Segmented';

/** The one way to pick a time control, with what the sand clock means when it is picked. */
export function TimeControlPicker({
  value,
  onChange,
}: {
  value: TimeControl;
  onChange: (value: TimeControl) => void;
}) {
  const options = TIME_CONTROLS.map(({ label }) => ({
    value: label,
    label: timeControlName(label),
  }));
  return (
    <>
      <Segmented label={t('Time control')} options={options} value={value} onChange={onChange} />
      {value === 'sand' && <Hint>{t(SAND_CLOCK_TEXT)}</Hint>}
    </>
  );
}
