import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export type TabIconName = 'play' | 'leaderboard' | 'me';

/** Simple line icons for the tab bar, drawn in the tab's colour. Decorative: tabs have labels. */
export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: ColorValue;
  size?: number;
}) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'play' && (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={2} {...stroke} />
          <Line x1={3} y1={3} x2={21} y2={21} {...stroke} />
          <Line x1={21} y1={3} x2={3} y2={21} {...stroke} />
          <Line x1={12} y1={3} x2={12} y2={21} {...stroke} />
          <Line x1={3} y1={12} x2={21} y2={12} {...stroke} />
        </>
      )}
      {name === 'leaderboard' && (
        <>
          <Path d="M4 21V13h5v8M9.5 21V7h5v14M15 21v-10h5v10" {...stroke} />
          <Line x1={2} y1={21} x2={22} y2={21} {...stroke} />
        </>
      )}
      {name === 'me' && (
        <>
          <Circle cx={12} cy={8} r={4} {...stroke} />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...stroke} />
        </>
      )}
    </Svg>
  );
}
