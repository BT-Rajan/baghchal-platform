/**
 * The board's surface: a framed panel with grain (wood) or veining (stone), and the lines carved
 * into it, in the colours of the player's board theme. Drawn in the board's 100×100 box; the
 * grain is generated once, the same on every board.
 */
import { useId } from 'react';
import {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import type { BoardPalette } from '@/appearance/catalog';

interface Grain {
  d: string;
  width: number;
  opacity: number;
  dark: boolean;
}

/** Gently wavy lines across the panel, from a fixed seed so every board looks the same. */
function makeGrain(): Grain[] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grain: Grain[] = [];
  for (let i = 0; i < 36; i++) {
    const y0 = (i + rand() * 0.8) * 2.9;
    const amp = 0.5 + rand() * 1.5;
    const phase = rand() * Math.PI * 2;
    let d = `M-2 ${y0.toFixed(2)}`;
    for (let x = 2; x <= 104; x += 4) {
      const y = y0 + Math.sin(x / 14 + phase) * amp + Math.sin(x / 5 + phase * 2) * amp * 0.25;
      d += ` L${x} ${y.toFixed(2)}`;
    }
    grain.push({
      d,
      width: 0.2 + rand() * 0.55,
      opacity: 0.07 + rand() * 0.13,
      dark: rand() < 0.7,
    });
  }
  return grain;
}

const GRAIN = makeGrain();

export interface Groove {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function Wood({ grooves, palette }: { grooves: readonly Groove[]; palette: BoardPalette }) {
  const id = `wood${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}panel`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.light} />
          <Stop offset="0.5" stopColor={palette.base} />
          <Stop offset="1" stopColor={palette.dark} />
        </LinearGradient>
        <ClipPath id={`${id}clip`}>
          <Rect x={0} y={0} width={100} height={100} rx={3} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} rx={3} fill={`url(#${id}panel)`} />
      <G clipPath={`url(#${id}clip)`}>
        {GRAIN.map((g, i) => (
          <Path
            key={i}
            d={g.d}
            stroke={g.dark ? palette.grain : palette.light}
            strokeWidth={g.width}
            opacity={g.opacity}
            fill="none"
          />
        ))}
        {/* A knot, off to one side. */}
        {palette.knot && (
          <G fill="none" stroke={palette.grain}>
            {[4.5, 3.2, 2, 0.9].map((r, i) => (
              <Ellipse
                key={r}
                cx={78}
                cy={22}
                rx={r * 1.6}
                ry={r}
                strokeWidth={0.35}
                opacity={0.12 + i * 0.05}
              />
            ))}
          </G>
        )}
      </G>
      {/* The frame: a darker rim with a lit inner edge. */}
      <Rect
        x={0.8}
        y={0.8}
        width={98.4}
        height={98.4}
        rx={2.6}
        fill="none"
        stroke={palette.frame}
        strokeWidth={1.6}
      />
      <Rect
        x={2.2}
        y={2.2}
        width={95.6}
        height={95.6}
        rx={1.8}
        fill="none"
        stroke={palette.light}
        strokeWidth={0.4}
        opacity={0.6}
      />
      {/* Carved lines: the lit lower wall of each groove, then the groove's shadow. */}
      {grooves.map((g) => (
        <Line
          key={`${g.key}-lit`}
          x1={g.x1 + 0.3}
          y1={g.y1 + 0.4}
          x2={g.x2 + 0.3}
          y2={g.y2 + 0.4}
          stroke={palette.lit}
          strokeWidth={0.55}
          strokeLinecap="round"
          opacity={0.8}
        />
      ))}
      {grooves.map((g) => (
        <Line
          key={g.key}
          x1={g.x1}
          y1={g.y1}
          x2={g.x2}
          y2={g.y2}
          stroke={palette.line}
          strokeWidth={0.9}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

/** An empty point: a small hole drilled where lines meet. */
export function Hole({ palette }: { palette: BoardPalette }) {
  return (
    <>
      <Circle cx={50} cy={51.5} r={7.5} fill={palette.lit} opacity={0.7} />
      <Circle cx={50} cy={50} r={7} fill={palette.line} />
    </>
  );
}
