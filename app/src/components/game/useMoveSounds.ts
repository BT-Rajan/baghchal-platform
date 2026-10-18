import { useEffect, useRef, useState } from 'react';

import type { Game } from '@/api/endpoints';
import { soundFor } from '@/game/sounds';

import { playSound } from './sound';

const KEY = 'baghchal.sounds';

/** Sounds on or off, remembered on this device (web); on unless turned off. */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const set = (value: boolean) => {
    setOn(value);
    try {
      globalThis.localStorage?.setItem(KEY, value ? 'on' : 'off');
    } catch {
      // Storage can be blocked; the choice then lasts until the page is closed.
    }
  };
  return [on, set];
}

/** Plays a sound for each move as it arrives: mine, the opponent's or the computer's. */
export function useMoveSounds(game: Game | undefined, enabled: boolean) {
  const seen = useRef<{ id: string; ply: number } | null>(null);
  useEffect(() => {
    if (game === undefined) return;
    const before = seen.current?.id === game.id ? seen.current.ply : null;
    seen.current = { id: game.id, ply: game.ply };
    const sound = soundFor(before, game.ply, game.moves);
    if (enabled && sound !== null) playSound(sound);
  }, [game, enabled]);
}
