/** Moves in the server's notation: placement `c3`, step `a1-b2`, capture `a1xc3`. */
export type Move =
  | { kind: 'place'; to: string; text: string }
  | { kind: 'step'; from: string; to: string; text: string }
  | { kind: 'capture'; from: string; to: string; over: string; text: string };

const POINT = '[a-e][1-5]';
const PATTERN = new RegExp(`^(?:(${POINT})([-x]))?(${POINT})$`);

function middle(from: string, to: string): string {
  const file = (from.charCodeAt(0) + to.charCodeAt(0)) / 2;
  const rank = (Number(from[1]) + Number(to[1])) / 2;
  return `${String.fromCharCode(file)}${rank}`;
}

export function parseMove(text: string): Move | null {
  const m = PATTERN.exec(text);
  if (!m) return null;
  const [, from, sep, to] = m as unknown as [string, string | undefined, string, string];
  if (!from) return { kind: 'place', to, text };
  if (sep === '-') return { kind: 'step', from, to, text };
  return { kind: 'capture', from, to, over: middle(from, to), text };
}

/** What a tap means given the legal moves. Selection is the piece picked up, if any. */
export interface TapResult {
  selected: string | null;
  move: string | null;
}

/** The legal moves, parsed once per position. */
export class MoveOptions {
  readonly placements: ReadonlySet<string>;
  private readonly from = new Map<string, Move[]>();

  constructor(legal: readonly string[]) {
    const placements = new Set<string>();
    for (const text of legal) {
      const move = parseMove(text);
      if (!move) continue;
      if (move.kind === 'place') placements.add(move.to);
      else this.from.set(move.from, [...(this.from.get(move.from) ?? []), move]);
    }
    this.placements = placements;
  }

  /** Points whose piece can move. */
  movable(): ReadonlySet<string> {
    return new Set(this.from.keys());
  }

  /** Where the piece on `from` can go. */
  targets(from: string | null): ReadonlyMap<string, Move> {
    const moves = from ? (this.from.get(from) ?? []) : [];
    return new Map(moves.map((m) => [m.to, m]));
  }

  tap(selected: string | null, point: string): TapResult {
    if (this.placements.has(point)) return { selected: null, move: point };
    const target = this.targets(selected).get(point);
    if (target) return { selected: null, move: target.text };
    if (this.from.has(point)) return { selected: point === selected ? null : point, move: null };
    return { selected: null, move: null };
  }
}
