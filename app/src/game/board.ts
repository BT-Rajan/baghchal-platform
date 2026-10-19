/** The 5×5 board: points a1–e5, files a–e left to right, ranks 1–5 bottom to top. */

export const FILES = ['a', 'b', 'c', 'd', 'e'] as const;
export const SIZE = 5;

export interface Point {
  name: string;
  /** 0 (file a) to 4 (file e). */
  file: number;
  /** 0 (rank 1) to 4 (rank 5). */
  rank: number;
}

function point(file: number, rank: number): Point {
  return { name: `${FILES[file]}${rank + 1}`, file, rank };
}

export const POINTS: readonly Point[] = Array.from({ length: SIZE * SIZE }, (_, i) =>
  point(i % SIZE, Math.floor(i / SIZE)),
);

const BY_NAME = new Map(POINTS.map((p) => [p.name, p]));

export function pointNamed(name: string): Point | undefined {
  return BY_NAME.get(name);
}

/** The lines drawn on the board: orthogonal ones everywhere, diagonals from even points. */
export const LINES: readonly (readonly [Point, Point])[] = POINTS.flatMap((p) => {
  const lines: [Point, Point][] = [];
  const add = (df: number, dr: number) => {
    const f = p.file + df;
    const r = p.rank + dr;
    if (f >= 0 && f < SIZE && r >= 0 && r < SIZE) lines.push([p, point(f, r)]);
  };
  add(1, 0);
  add(0, 1);
  if ((p.file + p.rank) % 2 === 0) {
    add(1, 1);
    add(-1, 1);
  }
  return lines;
});
