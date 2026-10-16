/**
 * The board. Lines are drawn with SVG; every point is a real button (with a label for screen
 * readers), so the board works by touch, mouse, keyboard and assistive technology alike.
 * Layout is in percentages of a square, so it fits any size without measuring.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { Piece, Position } from '@/game/bfen';
import { EDGES, POINTS, SIZE, type Point } from '@/game/board';
import { highlights, movePoints, tap } from '@/game/moveInput';
import { colors } from '@/theme';

/** Distance from the edge to the outer lines, and between lines, in % of the board. */
const MARGIN = 10;
const GAP = (100 - 2 * MARGIN) / (SIZE - 1);
/** Each point's touch area, in % of the board. */
const HIT = 17;

const x = (p: Point) => MARGIN + p.file * GAP;
const y = (p: Point) => MARGIN + (SIZE - 1 - p.rank) * GAP;

export interface BoardProps {
  position: Position;
  /** The server's legal moves when it is my turn; empty otherwise. */
  legalMoves: readonly string[];
  lastMove?: string | undefined;
  onMove: (move: string) => void;
}

export function Board({ position, legalMoves, lastMove, onMove }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const { movable, targets } = highlights(legalMoves, selected);
  const last = new Set(movePoints(lastMove));

  const press = (point: string) => {
    const result = tap(legalMoves, selected, point);
    setSelected(result.selected);
    if (result.move !== null) onMove(result.move);
  };

  return (
    <View style={styles.board} aria-label="Board">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        {EDGES.map(([p, q]) => (
          <Line
            key={`${p.name}-${q.name}`}
            x1={x(p)}
            y1={y(p)}
            x2={x(q)}
            y2={y(q)}
            stroke={colors.boardLine}
            strokeWidth={0.6}
            strokeLinecap="round"
          />
        ))}
      </Svg>
      {POINTS.map((p) => {
        const piece = position.pieces.get(p.name);
        const isSelected = p.name === selected;
        const isTarget = targets.has(p.name);
        const canPick = movable.has(p.name);
        return (
          <Pressable
            key={p.name}
            role="button"
            aria-label={pointLabel(p.name, piece, isSelected, isTarget, canPick)}
            aria-selected={isSelected}
            aria-disabled={!isTarget && !canPick && selected === null}
            onPress={() => press(p.name)}
            style={[
              styles.point,
              { left: `${x(p) - HIT / 2}%`, top: `${y(p) - HIT / 2}%` },
              last.has(p.name) && styles.last,
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              {piece === 'tiger' && <Tiger />}
              {piece === 'goat' && <Goat />}
              {piece === undefined && !isTarget && (
                <Circle cx={50} cy={50} r={7} fill={colors.boardLine} />
              )}
              {isTarget && (
                <Circle
                  cx={50}
                  cy={50}
                  r={piece === undefined ? 13 : 46}
                  fill={piece === undefined ? colors.highlight : 'none'}
                  stroke={colors.highlight}
                  strokeWidth={piece === undefined ? 0 : 6}
                  opacity={piece === undefined ? 0.6 : 0.85}
                />
              )}
              {(isSelected || (canPick && selected === null)) && (
                <Circle
                  cx={50}
                  cy={50}
                  r={46}
                  fill="none"
                  stroke={colors.highlight}
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
): string {
  const parts = [name, piece ?? 'empty'];
  if (selected) parts.push('selected');
  else if (target) parts.push(piece === undefined ? 'move here' : 'capture');
  else if (movable) parts.push('can move');
  return parts.join(', ');
}

function Tiger() {
  return (
    <>
      <Circle
        cx={50}
        cy={50}
        r={38}
        fill={colors.tiger}
        stroke={colors.tigerStripe}
        strokeWidth={3}
      />
      <Path
        d="M30 34 Q40 42 34 52 M50 22 Q56 34 50 44 M70 34 Q60 42 66 52 M38 64 Q50 58 62 64"
        stroke={colors.tigerStripe}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function Goat() {
  return (
    <>
      <Circle cx={50} cy={50} r={33} fill={colors.goat} stroke={colors.goatEdge} strokeWidth={4} />
      <Path
        d="M38 36 Q32 24 26 26 M62 36 Q68 24 74 26"
        stroke={colors.goatEdge}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.board,
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
