/**
 * The board. Lines are drawn with SVG; every point is a real button (with a label for screen
 * readers), so the board works by touch, mouse, keyboard and assistive technology alike.
 * Layout is in percentages of a square, so it fits any size without measuring.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { BoardTheme, PieceSet } from '@/api/endpoints';
import { BOARDS } from '@/appearance/catalog';
import type { Piece, Position } from '@/game/bfen';
import { EDGES, POINTS, SIZE, type Point } from '@/game/board';
import { highlights, movePoints, tap } from '@/game/moveInput';
import { colors } from '@/theme';

import { focusRing } from '../focus';
import { Coin } from './Coin';
import { Hole, Wood } from './Wood';

/** Distance from the edge to the outer lines, and between lines, in % of the board. */
const MARGIN = 10;
const GAP = (100 - 2 * MARGIN) / (SIZE - 1);
/** Each point's touch area, in % of the board. */
const HIT = 17;

const x = (p: Point) => MARGIN + p.file * GAP;
const y = (p: Point) => MARGIN + (SIZE - 1 - p.rank) * GAP;

export const GROOVES = EDGES.map(([p, q]) => ({
  key: `${p.name}-${q.name}`,
  x1: x(p),
  y1: y(p),
  x2: x(q),
  y2: y(q),
}));

export interface BoardProps {
  position: Position;
  /** The server's legal moves when it is my turn; empty otherwise. */
  legalMoves: readonly string[];
  lastMove?: string | undefined;
  onMove: (move: string) => void;
  /** The player's board theme and piece set. */
  theme?: BoardTheme;
  pieces?: PieceSet;
  /** Goats to mark as in danger (the coach shows them). */
  danger?: readonly string[];
}

export function Board({
  position,
  legalMoves,
  lastMove,
  onMove,
  theme = 'wood',
  pieces = 'classic',
  danger = [],
}: BoardProps) {
  const palette = BOARDS[theme].palette;
  const [selected, setSelected] = useState<string | null>(null);
  const { movable, targets } = highlights(legalMoves, selected);
  const last = new Set(movePoints(lastMove));

  const press = (point: string) => {
    const result = tap(legalMoves, selected, point);
    setSelected(result.selected);
    if (result.move !== null) onMove(result.move);
  };

  return (
    <View style={[styles.board, { backgroundColor: palette.base }]} aria-label="Board">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Wood grooves={GROOVES} palette={palette} />
      </Svg>
      {POINTS.map((p) => {
        const piece = position.pieces.get(p.name);
        const isSelected = p.name === selected;
        const isTarget = targets.has(p.name);
        const canPick = movable.has(p.name);
        const inDanger = danger.includes(p.name);
        return (
          <Pressable
            key={p.name}
            role="button"
            aria-label={pointLabel(p.name, piece, isSelected, isTarget, canPick, inDanger)}
            aria-disabled={!isTarget && !canPick && selected === null}
            onPress={() => press(p.name)}
            style={(state) => [
              styles.point,
              { left: `${x(p) - HIT / 2}%`, top: `${y(p) - HIT / 2}%` },
              last.has(p.name) && styles.last,
              focusRing(state),
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              {inDanger && <Circle cx={50} cy={50} r={48} fill={colors.danger} opacity={0.35} />}
              {piece !== undefined && <Coin piece={piece} set={pieces} />}
              {piece === undefined && !isTarget && <Hole palette={palette} />}
              {isTarget && (
                <Circle
                  cx={50}
                  cy={50}
                  r={piece === undefined ? 11 : 46}
                  fill={piece === undefined ? colors.highlight : 'none'}
                  stroke={piece === undefined ? colors.highlightRing : colors.danger}
                  strokeWidth={piece === undefined ? 3 : 6}
                  opacity={0.9}
                />
              )}
              {(isSelected || (canPick && selected === null)) && (
                <Circle
                  cx={50}
                  cy={50}
                  r={46}
                  fill="none"
                  stroke={isSelected ? colors.highlightRing : colors.highlight}
                  strokeWidth={isSelected ? 8 : 3}
                  {...(!isSelected && { strokeDasharray: '8 6' })}
                />
              )}
            </Svg>
          </Pressable>
        );
      })}
    </View>
  );
}

function pointLabel(
  name: string,
  piece: Piece | undefined,
  selected: boolean,
  target: boolean,
  movable: boolean,
  danger: boolean,
): string {
  const parts = [name, piece ?? 'empty'];
  if (danger) parts.push('in danger');
  if (selected) parts.push('selected');
  else if (target) parts.push(piece === undefined ? 'move here' : 'capture');
  else if (movable) parts.push('can move');
  return parts.join(', ');
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
  },
  point: {
    position: 'absolute',
    width: `${HIT}%`,
    height: `${HIT}%`,
    borderRadius: 999,
  },
  last: { backgroundColor: colors.lastMove },
});
