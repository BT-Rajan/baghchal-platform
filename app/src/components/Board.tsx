import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { parseBfen, type Piece } from '@/game/bfen';
import { LINES, POINTS, SIZE, type Point } from '@/game/board';
import { MoveOptions, parseMove } from '@/game/moves';
import { usePalette } from '@/theme';

export interface BoardProps {
  /** BFEN of the position shown. */
  position: string;
  /** Moves the player may make now; empty when it is not their turn. */
  legalMoves: readonly string[];
  lastMove?: string | undefined;
  /** Called with a move in server notation. */
  onMove: (move: string) => void;
  disabled?: boolean;
}

const GLYPH: Record<Piece, string> = { tiger: '🐯', goat: '🐐' };

function describe(point: Point, piece: Piece | undefined, extra: string[]): string {
  return [point.name, piece ?? 'empty', ...extra].join(', ');
}

/** The board. Every point is a button, so it works with taps, keyboards and screen readers. */
export const Board = memo(function Board({
  position,
  legalMoves,
  lastMove,
  onMove,
  disabled,
}: BoardProps) {
  const palette = usePalette();
  const [size, setSize] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedFor, setSelectedFor] = useState(position);
  const parsed = useMemo(() => parseBfen(position), [position]);
  const options = useMemo(
    () => new MoveOptions(disabled ? [] : legalMoves),
    [legalMoves, disabled],
  );
  const last = useMemo(() => (lastMove ? parseMove(lastMove) : null), [lastMove]);

  // A selection belongs to one position: drop it when the position changes.
  let current = selected;
  if (selectedFor !== position) {
    setSelectedFor(position);
    setSelected(null);
    current = null;
  }

  const movable = options.movable();
  const targets = options.targets(current);
  const lastPoints = new Set(last ? [last.to, ...('from' in last ? [last.from] : [])] : []);

  const pad = size / 10;
  const step = (size - 2 * pad) / (SIZE - 1);
  const at = (p: Point) => ({ x: pad + p.file * step, y: pad + (SIZE - 1 - p.rank) * step });
  const cell = step * 0.78;

  const tap = (name: string) => {
    const result = options.tap(current, name);
    setSelected(result.selected);
    if (result.move) onMove(result.move);
  };

  return (
    <View
      style={styles.frame}
      onLayout={(e: LayoutChangeEvent) => setSize(Math.floor(e.nativeEvent.layout.width))}
      accessibilityLabel="Board"
      testID="board"
    >
      {size > 0 ? (
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size} accessible={false}>
            <Rect x={0} y={0} width={size} height={size} rx={size / 40} fill={palette.boardWood} />
            {LINES.map(([a, b]) => {
              const p = at(a);
              const q = at(b);
              return (
                <Line
                  key={`${a.name}${b.name}`}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  stroke={palette.boardLine}
                  strokeWidth={Math.max(1.5, size / 220)}
                  strokeLinecap="round"
                />
              );
            })}
          </Svg>
          {POINTS.map((point) => {
            const { x, y } = at(point);
            const piece = parsed.pieces.get(point.name);
            const isTarget = targets.has(point.name) || options.placements.has(point.name);
            const isMovable = movable.has(point.name);
            const isSelected = current === point.name;
            const notes = [
              ...(isSelected ? ['selected'] : []),
              ...(isMovable && !isSelected ? ['can move'] : []),
              ...(targets.get(point.name)?.kind === 'capture' ? ['capture here'] : []),
              ...(isTarget && !targets.has(point.name) ? ['place a goat here'] : []),
              ...(targets.get(point.name)?.kind === 'step' ? ['move here'] : []),
            ];
            const interactive = isTarget || isMovable;
            return (
              <Pressable
                key={point.name}
                testID={`point-${point.name}`}
                accessibilityRole="button"
                accessibilityLabel={describe(point, piece, notes)}
                accessibilityState={{ selected: isSelected, disabled: !interactive && !current }}
                onPress={() => tap(point.name)}
                style={[
                  styles.point,
                  {
                    left: x - cell / 2,
                    top: y - cell / 2,
                    width: cell,
                    height: cell,
                    borderRadius: cell / 2,
                  },
                  lastPoints.has(point.name) && { backgroundColor: palette.lastMove },
                ]}
              >
                {piece ? (
                  <View
                    style={[
                      styles.piece,
                      {
                        width: cell * 0.86,
                        height: cell * 0.86,
                        borderRadius: cell,
                        backgroundColor: piece === 'tiger' ? palette.tiger : palette.goat,
                        borderColor: isSelected
                          ? palette.highlight
                          : isMovable
                            ? palette.highlight
                            : palette.boardLine,
                        borderWidth: isSelected ? 4 : isMovable ? 2 : 1,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: cell * 0.5 }} accessible={false}>
                      {GLYPH[piece]}
                    </Text>
                  </View>
                ) : isTarget ? (
                  <View
                    style={{
                      width: cell * 0.32,
                      height: cell * 0.32,
                      borderRadius: cell,
                      backgroundColor: palette.highlight,
                    }}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 1 },
  point: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  piece: { alignItems: 'center', justifyContent: 'center' },
});
