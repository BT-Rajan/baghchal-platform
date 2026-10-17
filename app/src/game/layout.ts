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

/** The board is square and as large as fits, keeping both clocks on screen. */
export function boardSize(layout: Layout, width: number, height: number): number {
  // Height taken by the header, player bars and spacing, in points.
  const chrome = layout === 'short' ? 110 : 240;
  const available = layout === 'stacked' ? width : Math.min(640, width / 2);
  return Math.max(200, Math.min(available, height - chrome));
}
