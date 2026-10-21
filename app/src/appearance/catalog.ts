/**
 * Boards, piece sets and sound packs. The first of each is free; the rest come with the themes
 * feature (ClawPlay Plus and Pro). Colours are drawn by components/game/Wood.tsx and Coin.tsx.
 */
import type { Appearance, BoardTheme, PieceSet, SoundPack } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { colors } from '@/theme';

export const FREE_APPEARANCE: Appearance = {
  board: 'wood',
  pieces: 'classic',
  sounds: 'gentle',
  sounds_on: true,
  emotes_on: true,
  show_badge: true,
  language: 'auto',
};

export interface BoardPalette {
  /** The panel's gradient, light to dark. */
  light: string;
  base: string;
  dark: string;
  /** The grain or veining across it. */
  grain: string;
  frame: string;
  /** The carved lines, and the lit wall below each. */
  line: string;
  lit: string;
  /** A knot in the wood; stone has none. */
  knot: boolean;
}

export const BOARDS: Record<BoardTheme, { name: string; palette: BoardPalette }> = {
  wood: {
    name: 'Wood',
    palette: {
      light: colors.woodLight,
      base: colors.board,
      dark: colors.woodDark,
      grain: colors.woodGrain,
      frame: colors.woodFrame,
      line: colors.boardLine,
      lit: colors.woodLight,
      knot: true,
    },
  },
  walnut: {
    name: 'Walnut',
    palette: {
      light: '#b5835a',
      base: '#7f5332',
      dark: '#4d2e18',
      grain: '#26140a',
      frame: '#331c0d',
      line: '#1a0e06',
      lit: '#c99a6b',
      knot: true,
    },
  },
  slate: {
    name: 'Slate',
    palette: {
      light: '#88929b',
      base: '#5e676f',
      dark: '#3a4148',
      grain: '#252a2f',
      frame: '#23282d',
      line: '#eef1f3',
      lit: '#2c3237',
      knot: false,
    },
  },
  jade: {
    name: 'Jade',
    palette: {
      light: '#a8dcbf',
      base: '#62ab86',
      dark: '#2e6c4f',
      grain: '#1b4632',
      frame: '#1a402e',
      line: '#103022',
      lit: '#cdf0dc',
      knot: false,
    },
  },
  night: {
    name: 'Midnight',
    palette: {
      light: '#41528a',
      base: '#26335f',
      dark: '#121a39',
      grain: '#090e24',
      frame: '#0b112c',
      line: '#e3bb5c',
      lit: '#090e24',
      knot: false,
    },
  },
};

export interface Finish {
  light: string;
  base: string;
  dark: string;
  edge: string;
  bevelLight: string;
  bevelDark: string;
  /** The emblem. */
  ink: string;
}

const CLASSIC: Record<Piece, Finish> = {
  tiger: {
    light: colors.tigerLight,
    base: colors.tiger,
    dark: colors.tigerDark,
    edge: colors.tigerEdge,
    bevelLight: colors.tigerBevel,
    bevelDark: colors.tigerDark,
    ink: colors.tigerStripe,
  },
  goat: {
    light: '#ffffff',
    base: colors.goat,
    dark: colors.goatShade,
    edge: colors.goatEdge,
    bevelLight: '#ffffff',
    bevelDark: colors.goatShade,
    ink: colors.goatInk,
  },
};

export const PIECES: Record<PieceSet, { name: string; finish: Record<Piece, Finish> }> = {
  classic: { name: 'Classic', finish: CLASSIC },
  bronze: {
    name: 'Bronze and pearl',
    finish: {
      tiger: {
        light: '#f2c992',
        base: '#b0743a',
        dark: '#6b3d16',
        edge: '#3d200a',
        bevelLight: '#ffe0b0',
        bevelDark: '#6b3d16',
        ink: '#2e1606',
      },
      goat: {
        light: '#ffffff',
        base: '#ece6f0',
        dark: '#b5aec2',
        edge: '#6c657a',
        bevelLight: '#ffffff',
        bevelDark: '#b5aec2',
        ink: '#4a4458',
      },
    },
  },
  porcelain: {
    name: 'Porcelain',
    finish: {
      tiger: {
        light: '#7fa6ea',
        base: '#2f5fb8',
        dark: '#173a7a',
        edge: '#0e2350',
        bevelLight: '#c9dbff',
        bevelDark: '#173a7a',
        ink: '#f4f7ff',
      },
      goat: {
        light: '#ffffff',
        base: '#f3f6fb',
        dark: '#c3cfe2',
        edge: '#6f7f9c',
        bevelLight: '#ffffff',
        bevelDark: '#c3cfe2',
        ink: '#2f5fb8',
      },
    },
  },
  royal: {
    name: 'Gold and silver',
    finish: {
      tiger: {
        light: '#fff1a8',
        base: '#e0b23a',
        dark: '#94690f',
        edge: '#5a3e05',
        bevelLight: '#fff6c8',
        bevelDark: '#94690f',
        ink: '#4a3203',
      },
      goat: {
        light: '#ffffff',
        base: '#d6dbe0',
        dark: '#8e979f',
        edge: '#4f575e',
        bevelLight: '#ffffff',
        bevelDark: '#8e979f',
        ink: '#3a4148',
      },
    },
  },
};

export const SOUNDS: Record<SoundPack, { name: string; description: string }> = {
  gentle: { name: 'Gentle', description: 'A soft tock, and a growl for a capture' },
  woodblock: { name: 'Woodblock', description: 'Crisp wooden knocks, a heavy thud for a capture' },
  bells: { name: 'Temple bells', description: 'Small bells, and a gong for a capture' },
  arcade: { name: 'Arcade', description: 'Bleeps and a zap, like an old game console' },
};

/** Whether a choice needs the themes feature (anything but the first board, pieces, sounds). */
export function isThemed(choice: Pick<Appearance, 'board' | 'pieces' | 'sounds'>): boolean {
  return (
    choice.board !== FREE_APPEARANCE.board ||
    choice.pieces !== FREE_APPEARANCE.pieces ||
    choice.sounds !== FREE_APPEARANCE.sounds
  );
}

export const BADGE_NAMES = { plus: 'PLUS', pro: 'PRO' } as const;
