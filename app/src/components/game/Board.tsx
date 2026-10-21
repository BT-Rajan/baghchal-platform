/**
 * The board. Lines are drawn with SVG; every point is a real button (with a label for screen
 * readers), so the board works by touch, mouse, keyboard and assistive technology alike.
 * Layout is in percentages of a square, so it fits any size without measuring.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { BoardTheme, PieceSet } from '@/api/endpoints';
import { BOARDS } from '@/appearance/catalog';
import type { Piece, Position } from '@/game/bfen';
import { EDGES, POINTS, SIZE, type Point } from '@/game/board';
import { highlights, movePoints, tap } from '@/game/moveInput';
import { t } from '@/i18n';
import { colors, radius, spacing, type } from '@/theme';

import { Button } from '../Button';
import { focusRing } from '../focus';
import { Notice } from '../Notice';
import { Coin } from './Coin';
import { Hole, Wood } from './Wood';

/** Distance from the edge to the outer lines, and between lines, in % of the board. */
const MARGIN = 10;
const GAP = (100 - 2 * MARGIN) / (SIZE - 1);
/** Each point's touch area, in % of the board. */
const HIT = 17;

/** The coordinates' strip beside and under the board, in px. */
const LABELS = 18;
const FILES = POINTS.filter((p) => p.rank === 0);
const RANKS = POINTS.filter((p) => p.file === 0);

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
  /** A move to show (a puzzle's answer): where it goes from and to, each marked its own way. */
  best?: string | undefined;
  onMove: (move: string) => void;
  /** The player's board theme and piece set. */
  theme?: BoardTheme;
  pieces?: PieceSet;
}

/** Large text grows the edge labels only so far: they sit in a narrow strip beside the board. */
const EDGE_TEXT_GROWTH = 1.3;

export function Board({
  position,
  legalMoves,
  lastMove,
  best,
  onMove,
  theme = 'wood',
  pieces = 'classic',
}: BoardProps) {
  const palette = BOARDS[theme].palette;
  const [selected, setSelected] = useState<string | null>(null);
  const { movable, targets } = highlights(legalMoves, selected);
  const last = new Set(movePoints(lastMove));
  const [bestFrom, bestTo] = bestPoints(best);

  const press = (point: string) => {
    const result = tap(legalMoves, selected, point);
    setSelected(result.selected);
    if (result.move !== null) onMove(result.move);
  };

  return (
    // The points' names on the edges (a–e under it, 1–5 beside it), so a move named in text
    // ("c3-d4") can be found; screen readers hear each point's name on the point itself.
    <View style={styles.frame}>
      <View style={styles.withRanks}>
        <View style={styles.ranks} aria-hidden>
          {RANKS.map((p) => (
            <View key={p.rank} style={[styles.rank, { top: `${y(p) - GAP / 2}%` }]}>
              <Text style={styles.label} maxFontSizeMultiplier={EDGE_TEXT_GROWTH}>
                {String(p.rank + 1)}
              </Text>
            </View>
          ))}
        </View>
        <View style={[styles.board, { backgroundColor: palette.base }]} aria-label={t('Board')}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Wood grooves={GROOVES} palette={palette} />
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
                aria-disabled={!isTarget && !canPick && selected === null}
                onPress={() => press(p.name)}
                style={(state) => [
                  styles.point,
                  { left: `${x(p) - HIT / 2}%`, top: `${y(p) - HIT / 2}%` },
                  last.has(p.name) && styles.last,
                  p.name === bestFrom && styles.bestFrom,
                  p.name === bestTo && styles.bestTo,
                  focusRing(state),
                ]}
              >
                <Svg width="100%" height="100%" viewBox="0 0 100 100">
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
      </View>
      <View style={styles.files} aria-hidden>
        {FILES.map((p) => (
          <View key={p.file} style={[styles.file, { left: `${x(p) - GAP / 2}%` }]}>
            <Text style={styles.label} maxFontSizeMultiplier={EDGE_TEXT_GROWTH}>
              {p.name.charAt(0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * In place of a board whose position could not be read (the game's, a puzzle's): what went
 * wrong, and a way to load it again.
 */
export function BoardUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.unavailable}>
      <Notice tone="error">{t('This position could not be shown.')}</Notice>
      <Button title={t('Try again')} variant="secondary" compact onPress={onRetry} />
    </View>
  );
}

/** A move's from and to points; a placement has only a to. */
function bestPoints(move: string | undefined): [string | null, string | null] {
  const points = movePoints(move);
  if (points.length === 0) return [null, null];
  return points.length === 1 ? [null, points[0]!] : [points[0]!, points[1]!];
}

function pointLabel(
  name: string,
  piece: Piece | undefined,
  selected: boolean,
  target: boolean,
  movable: boolean,
): string {
  const parts = [name, piece === 'goat' ? t('goat') : piece === 'tiger' ? t('tiger') : t('empty')];
  if (selected) parts.push(t('selected'));
  else if (target) parts.push(piece === undefined ? t('move here') : t('capture'));
  else if (movable) parts.push(t('can move'));
  return parts.join(', ');
}

const styles = StyleSheet.create({
  // The board's points are named by file and rank: it stays left to right in every language.
  frame: { direction: 'ltr', width: '100%' },
  withRanks: { flexDirection: 'row' },
  ranks: { width: LABELS },
  rank: { position: 'absolute', left: 0, right: 0, height: `${GAP}%`, justifyContent: 'center' },
  files: { height: LABELS, marginLeft: LABELS },
  file: { position: 'absolute', top: 0, bottom: 0, width: `${GAP}%`, alignItems: 'center' },
  label: { ...type.caption, color: colors.muted, textAlign: 'center' },
  board: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.board,
  },
  point: {
    position: 'absolute',
    width: `${HIT}%`,
    height: `${HIT}%`,
    borderRadius: 999,
  },
  last: { backgroundColor: colors.lastMove },
  unavailable: { gap: spacing.sm },
  // The best move: a dashed ring where it starts, a solid one where it ends.
  bestFrom: { borderWidth: 3, borderStyle: 'dashed', borderColor: colors.success },
  bestTo: { borderWidth: 4, borderColor: colors.success, backgroundColor: colors.lastMove },
});
