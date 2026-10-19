import { FILES, SIZE } from './board';

export type Piece = 'tiger' | 'goat';

export interface Position {
  /** What stands on each occupied point, by name (`c3`). */
  pieces: ReadonlyMap<string, Piece>;
  toMove: Piece;
  goatsInHand: number;
  goatsCaptured: number;
}

/** Parses BFEN (docs/rules.md), e.g. `T3T/5/5/5/T3T g 20 0`. Throws on anything malformed. */
export function parseBfen(bfen: string): Position {
  const fields = bfen.trim().split(/\s+/);
  const [board, side, hand, captured] = fields;
  const fail = (why: string): never => {
    throw new Error(`Invalid BFEN "${bfen}": ${why}`);
  };
  if (fields.length !== 4 || !board || !side || !hand || !captured) fail('expected 4 fields');
  const ranks = board!.split('/');
  if (ranks.length !== SIZE) fail('expected 5 ranks');
  const pieces = new Map<string, Piece>();
  ranks.forEach((row, i) => {
    const rank = SIZE - i;
    let file = 0;
    for (const c of row) {
      if (c >= '1' && c <= '5') file += Number(c);
      else if (c === 'T' || c === 'G') {
        if (file >= SIZE) fail(`rank ${rank} is too long`);
        pieces.set(`${FILES[file]}${rank}`, c === 'T' ? 'tiger' : 'goat');
        file += 1;
      } else fail(`unexpected "${c}"`);
    }
    if (file !== SIZE) fail(`rank ${rank} does not have 5 points`);
  });
  if (side !== 'g' && side !== 't') fail('side to move must be g or t');
  if (!/^\d{1,2}$/.test(hand!) || !/^\d$/.test(captured!)) fail('bad goat counts');
  return {
    pieces,
    toMove: side === 'g' ? 'goat' : 'tiger',
    goatsInHand: Number(hand),
    goatsCaptured: Number(captured),
  };
}
