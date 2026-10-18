/**
 * The pieces as raised coins: a shadow, a visible edge, a domed face, a bevelled ring and an
 * embossed emblem (a tiger's head or a goat's). Drawn in a 100×100 box, like the board points.
 */
import { useId } from 'react';
import {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import type { Piece } from '@/game/bfen';
import { colors } from '@/theme';

interface Finish {
  light: string;
  base: string;
  dark: string;
  edge: string;
  bevelLight: string;
  bevelDark: string;
  ink: string;
}

const FINISH: Record<Piece, Finish> = {
  tiger: {
    light: colors.tigerLight,
    base: colors.tiger,
    dark: colors.tigerDark,
    edge: colors.tigerEdge,
    bevelLight: colors.tigerBevel,
    bevelDark: colors.tigerDark,
    ink: colors.tigerStripe,
  },
  goat: {
    light: '#ffffff',
    base: colors.goat,
    dark: colors.goatShade,
    edge: colors.goatEdge,
    bevelLight: '#ffffff',
    bevelDark: colors.goatShade,
    ink: colors.goatInk,
  },
};

/** Tigers are a little larger, so the two read apart at a glance as well as by colour. */
const RADIUS: Record<Piece, number> = { tiger: 40, goat: 37 };

export function Coin({ piece }: { piece: Piece }) {
  // Gradient ids must be unique on a web page holding many boards' worth of coins.
  const id = `coin${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = FINISH[piece];
  const r = RADIUS[piece];
  const face = 50 - r * 0.04;
  const Emblem = piece === 'tiger' ? TigerHead : GoatHead;
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}face`} cx="38%" cy="32%" r="75%">
          <Stop offset="0" stopColor={c.light} />
          <Stop offset="0.55" stopColor={c.base} />
          <Stop offset="1" stopColor={c.dark} />
        </RadialGradient>
        <LinearGradient id={`${id}bevel`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.bevelLight} />
          <Stop offset="1" stopColor={c.bevelDark} />
        </LinearGradient>
      </Defs>
      {/* Shadow on the board, then the coin's edge showing below its face. */}
      <Ellipse cx={51} cy={50 + r * 0.22} rx={r} ry={r * 0.95} fill="#000" opacity={0.28} />
      <Circle cx={50} cy={50 + r * 0.12} r={r} fill={c.edge} />
      <Circle cx={50} cy={face} r={r} fill={`url(#${id}face)`} />
      <Circle
        cx={50}
        cy={face}
        r={r * 0.8}
        fill="none"
        stroke={`url(#${id}bevel)`}
        strokeWidth={2.2}
      />
      <G y={-r * 0.04}>
        {/* A light copy just below the emblem makes it look pressed into the face. */}
        <G y={0.9} opacity={0.55} stroke={c.bevelLight} fill={c.bevelLight}>
          <Emblem />
        </G>
        <G stroke={c.ink} fill={c.ink}>
          <Emblem />
        </G>
      </G>
      <Ellipse
        cx={38}
        cy={30}
        rx={r * 0.45}
        ry={r * 0.22}
        fill="#fff"
        opacity={0.28}
        rotation={-30}
        origin="38, 30"
      />
    </>
  );
}

function TigerHead() {
  return (
    <>
      <Circle cx={36} cy={31} r={6} strokeWidth={0} />
      <Circle cx={64} cy={31} r={6} strokeWidth={0} />
      <G fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M33 40 Q30 56 40 63 Q50 69 60 63 Q70 56 67 40 Q59 31 50 31 Q41 31 33 40 Z" />
        <Path d="M50 33 v6 M44 35 l2.5 5 M56 35 l-2.5 5" />
        <Path d="M33 47 h5 M33.5 53 h5 M67 47 h-5 M66.5 53 h-5" />
        <Path d="M46 59 q4 4 8 0" />
      </G>
      <Path d="M40 44 L47.5 46.5 L41.5 48.5 Z M60 44 L52.5 46.5 L58.5 48.5 Z" strokeWidth={1} />
      <Path d="M46 52 h8 l-4 4.5 Z" strokeWidth={0} />
    </>
  );
}

function GoatHead() {
  return (
    <>
      <G fill="none" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M44 37 Q40 23 30 24 M56 37 Q60 23 70 24" strokeWidth={4.5} />
        <Path d="M42 41 L29 44 L41 47 M58 41 L71 44 L59 47" strokeWidth={2.6} />
        <Path d="M41 38 Q50 33 59 38 Q61 55 50 66 Q39 55 41 38 Z" strokeWidth={3} />
        <Path d="M46.5 65 L50 74 L53.5 65" strokeWidth={2.6} />
        <Path d="M47 57 q3 2 6 0" strokeWidth={2} />
      </G>
      <Circle cx={45.5} cy={46} r={2.2} strokeWidth={0} />
      <Circle cx={54.5} cy={46} r={2.2} strokeWidth={0} />
    </>
  );
}
