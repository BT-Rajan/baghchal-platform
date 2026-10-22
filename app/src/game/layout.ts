/** Laying out the game screen for the space available. */

/**
 * - stacked: phones held upright; the panel goes below the board.
 * - side: wide screens; the board (between the player bars) beside the panel.
 * - short: wide but short, like a phone on its side; the player bars move into the panel so
 *   the board can use the full height.
 */
export type Layout = 'stacked' | 'side' | 'short';

export function gameLayout(width: number, height: number): Layout {
  if (width < 900 && !(width > height && width >= 600)) return 'stacked';
  return height < 600 ? 'short' : 'side';
}

/** What the screen around the game takes: its header bar and the device's safe-area insets. */
export interface Room {
  /** The header bar's height (0 without one); it already keeps clear of the status bar. */
  header: number;
  insets: { top: number; bottom: number; left: number; right: number };
}

// Heights in points of what sits above and below the board on the game screen.
/** The page's padding above and below (components/Screen.tsx: spacing.md and spacing.xl). */
const PAGE_PADDING = 16 + 32;
/** A player bar (components/game/PlayerBar.tsx: its clock, padding and border) and its gap. */
const PLAYER_BAR = 66 + 8;
/** The letters under the board (a–e). */
const EDGE_LABELS = 18;
/**
 * Upright, what the panel shows first under the board: the turn line and the row of controls
 * (56 tall, control.large in theme.ts), with their gaps; kept on screen with the clocks.
 */
const PANEL_ACTIONS = 120;
/** Narrower than this, a phone: upright, the board takes at most this share of the width. */
const PHONE_WIDTH = 600;
const PHONE_BOARD_SHARE = 0.8;

/**
 * The board is square and as large as fits, keeping both clocks on screen: the height left
 * once the header (or the status bar, without one), the bottom inset, the page's padding and
 * the player bars beside the board are taken away. A phone on its side ('short') has its player
 * bars in the panel instead. Upright ('stacked'), the panel's main buttons stay on screen too,
 * and on a phone the board leaves a margin at the sides (80% of the width at most).
 */
export function boardSize(layout: Layout, width: number, height: number, room: Room): number {
  const { header, insets } = room;
  const above = header > 0 ? header : insets.top;
  const bars = layout === 'short' ? 0 : 2 * PLAYER_BAR;
  const stacked = layout === 'stacked';
  const chrome =
    above + insets.bottom + PAGE_PADDING + bars + EDGE_LABELS + (stacked ? PANEL_ACTIONS : 0);
  const across = width - insets.left - insets.right;
  const phone = across < PHONE_WIDTH ? Math.round(across * PHONE_BOARD_SHARE) : across;
  const available = stacked ? phone : Math.min(640, across / 2);
  return Math.max(200, Math.min(available, height - chrome));
}
