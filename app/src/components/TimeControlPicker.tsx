import type { TimeControl } from '@/api/endpoints';
import { SAND_CLOCK_TEXT, TIME_CONTROLS, timeControlName } from '@/lobby/format';

import { Hint } from './Card';
import { Segmented } from './Segmented';

const OPTIONS = TIME_CONTROLS.map(({ label }) => ({ value: label, label: timeControlName(label) }));

/** The one way to pick a time control, with what the sand clock means when it is picked. */
export function TimeControlPicker({
  value,
  onChange,
}: {
  value: TimeControl;
  onChange: (value: TimeControl) => void;
}) {
  return (
    <>
      <Segmented label="Time control" options={OPTIONS} value={value} onChange={onChange} />
      {value === 'sand' && <Hint>{SAND_CLOCK_TEXT}</Hint>}
    </>
  );
}
