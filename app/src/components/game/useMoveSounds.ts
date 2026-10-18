import { useCallback, useEffect, useRef, useState } from 'react';

import type { Game, SoundPack } from '@/api/endpoints';
import { sideOf } from '@/game/describe';
import { endingFor, type Ending } from '@/game/ending';
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
export function useMoveSounds(
  game: Game | undefined,
  enabled: boolean,
  pack: SoundPack = 'gentle',
) {
  const seen = useRef<{ id: string; ply: number } | null>(null);
  useEffect(() => {
    if (game === undefined) return;
    const before = seen.current?.id === game.id ? seen.current.ply : null;
    seen.current = { id: game.id, ply: game.ply };
    const sound = soundFor(before, game.ply, game.moves);
    if (enabled && sound !== null) playSound(sound, pack);
  }, [game, enabled, pack]);
}

/**
 * The ending to celebrate when the game finishes while it is on screen (not when a finished game
 * is opened), with a fanfare or a lament once the last move's sound has played. `dismiss` hides
 * it.
 */
export function useEnding(
  game: Game | undefined,
  myId: string,
  soundOn: boolean,
  pack: SoundPack = 'gentle',
): [Ending | null, () => void] {
  const [seen, setSeen] = useState<{ id: string; status: string } | null>(null);
  const [ending, setEnding] = useState<Ending | null>(null);
  // Compare with what was last seen while rendering, so the ending shows with the final position.
  if (game !== undefined && (seen?.id !== game.id || seen.status !== game.status)) {
    const sameGame = seen?.id === game.id;
    setSeen({ id: game.id, status: game.status });
    const next = endingFor(sameGame ? seen.status : null, game, sideOf(game, myId));
    if (next !== null || !sameGame) setEnding(next);
  }
  const played = useRef<Ending | null>(null);
  useEffect(() => {
    if (ending === null || played.current === ending || !soundOn) return;
    played.current = ending;
    const timer = setTimeout(() => playSound(ending.won === false ? 'loss' : 'win', pack), 500);
    return () => clearTimeout(timer);
  }, [ending, soundOn, pack]);
  const dismiss = useCallback(() => setEnding(null), []);
  return [ending, dismiss];
}
