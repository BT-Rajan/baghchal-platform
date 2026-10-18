/** A small, still picture of a board theme and piece set, for choosing between them. */
import Svg, { G } from 'react-native-svg';

import type { BoardTheme, PieceSet } from '@/api/endpoints';
import { BOARDS } from '@/appearance/catalog';
import type { Piece } from '@/game/bfen';

import { GROOVES } from './Board';
import { Coin } from './Coin';
import { Hole, Wood } from './Wood';

/** The tigers in their corners and two goats placed, in the board's 100×100 box. */
const PIECES: readonly [number, number, Piece][] = [
  [10, 10, 'tiger'],
  [90, 10, 'tiger'],
  [10, 90, 'tiger'],
  [90, 90, 'tiger'],
  [50, 50, 'goat'],
  [30, 70, 'goat'],
];
const HOLES: readonly [number, number][] = [
  [30, 30],
  [70, 30],
  [70, 70],
  [50, 10],
  [10, 50],
  [90, 50],
  [50, 90],
];
const SIZE = 17;

export function BoardPreview({ theme, pieces }: { theme: BoardTheme; pieces: PieceSet }) {
  const palette = BOARDS[theme].palette;
  const at = (x: number, y: number) =>
    `translate(${x - SIZE / 2} ${y - SIZE / 2}) scale(${SIZE / 100})`;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden>
      <Wood grooves={GROOVES} palette={palette} />
      {HOLES.map(([x, y]) => (
        <G key={`${x}-${y}`} transform={at(x, y)}>
          <Hole palette={palette} />
        </G>
      ))}
      {PIECES.map(([x, y, piece]) => (
        <G key={`${x}-${y}`} transform={at(x, y)}>
          <Coin piece={piece} set={pieces} />
        </G>
      ))}
    </Svg>
  );
}
