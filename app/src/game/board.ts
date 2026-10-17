/**
 * Board geometry (docs/rules.md): 25 points a1–e5, files a–e left to right, ranks 1–5 bottom to
 * top. Every point joins its orthogonal neighbours, and diagonals join points whose file and
 * rank indices sum to an even number.
 */

export const SIZE = 5;
const FILES = 'abcde';

export interface Point {
  name: string;
  file: number;
  rank: number;
}

export function pointName(file: number, rank: number): string {
  return `${FILES[file]}${rank + 1}`;
}

/** Every point, from the top-left (a5) across and down to the bottom-right (e1). */
export const POINTS: readonly Point[] = Array.from({ length: SIZE * SIZE }, (_, i) => {
  const file = i % SIZE;
  const rank = SIZE - 1 - Math.floor(i / SIZE);
  return { name: pointName(file, rank), file, rank };
});

export type Edge = readonly [Point, Point];

function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < SIZE && rank >= 0 && rank < SIZE;
}

/** Each line segment between adjacent points, once: 40 orthogonal and 16 diagonal. */
export const EDGES: readonly Edge[] = POINTS.flatMap((p) => {
  const directions: [number, number][] = [
    [1, 0],
    [0, 1],
  ];
  if ((p.file + p.rank) % 2 === 0) directions.push([1, 1], [-1, 1]);
  return directions
    .filter(([df, dr]) => onBoard(p.file + df, p.rank + dr))
    .map(([df, dr]): Edge => {
      const q = POINTS.find((x) => x.file === p.file + df && x.rank === p.rank + dr) as Point;
      return [p, q];
    });
});
