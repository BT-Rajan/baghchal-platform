import { I18nManager, Platform, type ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { isRTL } from '@/i18n';

export type IconName =
  | 'play'
  | 'leaderboard'
  | 'me'
  | 'sound'
  | 'mute'
  | 'flag'
  | 'link'
  | 'trophy'
  | 'puzzle'
  | 'computer'
  | 'people'
  | 'chevron'
  | 'first'
  | 'previous'
  | 'next'
  | 'last'
  | 'settings'
  | 'palette'
  | 'shield'
  | 'bell'
  | 'chat'
  | 'document'
  | 'eye'
  | 'eye-off';

/**
 * Whether the screen is laid out right to left, which is the way arrows must point. In the apps
 * that is the layout direction in effect (I18nManager.isRTL, which changes only when the app
 * restarts after a change of language); on the web it is the current language's.
 */
export function layoutIsRTL(): boolean {
  return Platform.OS === 'web' ? isRTL() : I18nManager.isRTL;
}

/** Arrows drawn pointing "onward" (to the right), and pointing back, mirrored right to left. */
const ARROWS = {
  chevron: { bar: null, points: [9, 5, 16, 12, 9, 19] },
  next: { bar: null, points: [9, 5, 16, 12, 9, 19] },
  previous: { bar: null, points: [15, 5, 8, 12, 15, 19] },
  last: { bar: 18, points: [7, 5, 14, 12, 7, 19] },
  first: { bar: 6, points: [17, 5, 10, 12, 17, 19] },
} as const;

/**
 * The app's line icons (24-unit grid, 2-unit stroke), drawn in the colour they are given. They
 * are decorative: whatever carries one also has a text label or an accessible name.
 */
export function Icon({
  name,
  color,
  size = 24,
}: {
  name: IconName;
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
      {(name === 'sound' || name === 'mute') && <Path d="M4 9h4l5-4v14l-5-4H4z" {...stroke} />}
      {name === 'sound' && <Path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" {...stroke} />}
      {name === 'mute' && (
        <>
          <Line x1={16} y1={9} x2={22} y2={15} {...stroke} />
          <Line x1={22} y1={9} x2={16} y2={15} {...stroke} />
        </>
      )}
      {name === 'flag' && (
        <>
          <Line x1={5} y1={21} x2={5} y2={4} {...stroke} />
          <Path d="M5 4h12l-2.5 4.5L17 13H5" {...stroke} />
        </>
      )}
      {name === 'link' && (
        <Path
          d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
          {...stroke}
        />
      )}
      {name === 'trophy' && (
        <>
          <Path d="M8 4h8v5a4 4 0 0 1-8 0z" {...stroke} />
          <Path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" {...stroke} />
        </>
      )}
      {name === 'puzzle' && (
        <Path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4v-4a2 2 0 1 0 0-4z" {...stroke} />
      )}
      {name === 'computer' && (
        <>
          <Rect x={3} y={4} width={18} height={12} rx={2} {...stroke} />
          <Path d="M8 20h8M12 16v4" {...stroke} />
        </>
      )}
      {name === 'people' && (
        <>
          <Circle cx={9} cy={8} r={3.5} {...stroke} />
          <Path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5" {...stroke} />
          <Path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 15.3c1.7.7 2.9 2.2 3.5 4.7" {...stroke} />
        </>
      )}
      {/* "Onward": to the end of the line, the left in a right-to-left layout. The replay's
          first, previous, next and last turn the same way. */}
      {name in ARROWS && <Arrow arrow={ARROWS[name as keyof typeof ARROWS]} stroke={stroke} />}
      {name === 'document' && (
        <>
          <Path d="M14 3H6v18h12V7z" {...stroke} />
          <Polyline points="14 3 14 7 18 7" {...stroke} />
          <Line x1={9} y1={12} x2={15} y2={12} {...stroke} />
          <Line x1={9} y1={16} x2={15} y2={16} {...stroke} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...stroke} />
          <Circle cx={16} cy={7} r={2} {...stroke} />
          <Circle cx={10} cy={17} r={2} {...stroke} />
        </>
      )}
      {name === 'palette' && (
        <>
          <Path
            d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8.2-9-8.2z"
            {...stroke}
          />
          <Circle cx={7.5} cy={11} r={1} {...stroke} />
          <Circle cx={10.5} cy={7.5} r={1} {...stroke} />
          <Circle cx={15} cy={8} r={1} {...stroke} />
        </>
      )}
      {(name === 'eye' || name === 'eye-off') && (
        <>
          <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" {...stroke} />
          <Circle cx={12} cy={12} r={3} {...stroke} />
        </>
      )}
      {name === 'eye-off' && <Line x1={3} y1={3} x2={21} y2={21} {...stroke} />}
      {name === 'chat' && <Path d="M4 5h16v11H9l-5 4z" {...stroke} />}
      {name === 'bell' && (
        <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" {...stroke} />
      )}
      {name === 'shield' && (
        <Path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" {...stroke} />
      )}
    </Svg>
  );
}

function Arrow({ arrow, stroke }: { arrow: (typeof ARROWS)[keyof typeof ARROWS]; stroke: object }) {
  const mirror = layoutIsRTL();
  const x = (value: number) => (mirror ? 24 - value : value);
  const points = arrow.points.map((value, i) => (i % 2 === 0 ? x(value) : value)).join(' ');
  return (
    <>
      <Polyline points={points} {...stroke} />
      {arrow.bar !== null && (
        <Line x1={x(arrow.bar)} y1={5} x2={x(arrow.bar)} y2={19} {...stroke} />
      )}
    </>
  );
}
