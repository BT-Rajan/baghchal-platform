/**
 * Game sounds in four packs (the graphs are in synth.ts):
 *
 * - **Gentle** (free): a soft wooden tock for a move, a tiger's strike and growl for a capture, a
 *   fanfare when a game is won and two falling notes when it is lost.
 * - **Woodblock**: crisp knocks, and a heavy double thud for a capture.
 * - **Temple bells**: a small bell for a move, a gong for a capture.
 * - **Arcade**: square-wave bleeps, a falling zap for a capture.
 *
 * The web makes them on the spot with the Web Audio API. The Android and iOS apps play the same
 * sounds from WAV files rendered from those graphs (scripts/render-sounds.mjs), quietly under the
 * phone's silent switch, and the phone also gives a touch of feedback: on Android its own haptics
 * (a light tick for a move, confirm or reject for a win or loss, which follow the system's touch
 * feedback setting), on iOS an impact or notification.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { SoundPack } from '@/api/endpoints';

import { SOUND_FILES } from './soundFiles';
import { PACKS, type ContextLike, type GameSound } from './synth';

export type { GameSound } from './synth';

const AudioContextClass = (globalThis as { AudioContext?: new () => ContextLike }).AudioContext;
let context: ContextLike | null = null;

/** Whether this device can play the packs: Web Audio on the web, the sound files in the apps. */
export function soundSupported(): boolean {
  return AudioContextClass !== undefined || (Platform.OS !== 'web' && SOUND_FILES !== null);
}

/**
 * Browsers keep audio off until the page is clicked, tapped or typed on, and Safari only lets it
 * start inside that event itself. Moves arrive later (from the server), so audio is switched on
 * at the first touch of the page, with a silent note to wake it.
 */
function unlockOnFirstTouch() {
  const doc = (globalThis as { document?: EventTarget }).document;
  if (AudioContextClass === undefined || doc === undefined) return;
  const events = ['pointerdown', 'touchend', 'keydown'];
  const unlock = () => {
    try {
      context ??= new AudioContextClass();
      void context.resume().catch(() => {});
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(context.destination);
      silent.start(0);
    } catch {
      return;
    }
    for (const event of events) doc.removeEventListener(event, unlock, true);
  };
  for (const event of events) doc.addEventListener(event, unlock, true);
}

unlockOnFirstTouch();

const FEEL: Record<GameSound, () => Promise<void>> = {
  move: () => Haptics.selectionAsync(),
  capture: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  win: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  loss: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

const ANDROID_FEEL: Record<GameSound, Haptics.AndroidHaptics> = {
  move: Haptics.AndroidHaptics.Segment_Tick,
  capture: Haptics.AndroidHaptics.Long_Press,
  win: Haptics.AndroidHaptics.Confirm,
  loss: Haptics.AndroidHaptics.Reject,
};

function feel(sound: GameSound) {
  const felt =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(ANDROID_FEEL[sound])
      : FEEL[sound]();
  // A vibration is a nicety too: a phone without a vibrator says no, and that is fine.
  felt.catch(() => {});
}

const players = new Map<string, AudioPlayer>();
let modeSet = false;

/** Plays a rendered sound file, keeping one player per file so a sound starts at once. */
function playFile(name: string, file: number) {
  if (!modeSet) {
    modeSet = true;
    // Game sounds mix with the phone's music and keep quiet when it is on silent.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(
      () => {},
    );
  }
  let player = players.get(name);
  if (player === undefined) {
    player = createAudioPlayer(file);
    players.set(name, player);
  }
  const ready = player;
  ready.seekTo(0).then(
    () => ready.play(),
    () => ready.play(),
  );
}

export function playSound(sound: GameSound, pack: SoundPack = 'gentle'): void {
  try {
    if (AudioContextClass !== undefined) {
      context ??= new AudioContextClass();
      if (context.state === 'suspended') void context.resume().catch(() => {});
      PACKS[pack][sound](context, context.currentTime + 0.01);
      return;
    }
    if (Platform.OS === 'web') return;
    feel(sound);
    const file = SOUND_FILES?.[pack][sound];
    if (file !== undefined) playFile(`${pack}-${sound}`, file);
  } catch {
    // A sound is a nicety; never let it break the game.
  }
}
