/**
 * A small picture of a board theme and piece set, for choosing between them; given `placed`
 * (pieces by point, such as `{ a1: 'tiger' }`), it shows that position instead.
 */
import { StyleSheet } from 'react-native';
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

/** Where a point (a1 at the bottom left, e5 at the top right) sits in the 100×100 box. */
function spot(point: string): [number, number] {
  return [10 + (point.charCodeAt(0) - 97) * 20, 90 - (Number(point.slice(1)) - 1) * 20];
}

const POINTS = [...'abcde'].flatMap((file) => [1, 2, 3, 4, 5].map((rank) => `${file}${rank}`));

export function BoardPreview({
  theme,
  pieces,
  placed,
}: {
  theme: BoardTheme;
  pieces: PieceSet;
  placed?: Readonly<Record<string, Piece>>;
}) {
  const palette = BOARDS[theme].palette;
  const at = (x: number, y: number) =>
    `translate(${x - SIZE / 2} ${y - SIZE / 2}) scale(${SIZE / 100})`;
  const shown: readonly [number, number, Piece][] =
    placed === undefined
      ? PIECES
      : Object.entries(placed).map(([point, piece]) => [...spot(point), piece]);
  const holes: readonly [number, number][] =
    placed === undefined ? HOLES : POINTS.filter((p) => !(p in placed)).map(spot);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" style={styles.ltr} aria-hidden>
      <Wood grooves={GROOVES} palette={palette} />
      {holes.map(([x, y]) => (
        <G key={`${x}-${y}`} transform={at(x, y)}>
          <Hole palette={palette} />
        </G>
      ))}
      {shown.map(([x, y, piece]) => (
        <G key={`${x}-${y}`} transform={at(x, y)}>
          <Coin piece={piece} set={pieces} />
        </G>
      ))}
    </Svg>
  );
}

// Like the board itself, left to right in every language.
const styles = StyleSheet.create({ ltr: { direction: 'ltr' } });
