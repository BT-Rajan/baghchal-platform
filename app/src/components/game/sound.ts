/**
 * Game sounds, made on the spot with the Web Audio API (no sound files), in four packs:
 *
 * - **Gentle** (free): a soft wooden tock for a move, a tiger's strike and growl for a capture, a
 *   fanfare when a game is won and two falling notes when it is lost.
 * - **Woodblock**: crisp knocks, and a heavy double thud for a capture.
 * - **Temple bells**: a small bell for a move, a gong for a capture.
 * - **Arcade**: square-wave bleeps, a falling zap for a capture.
 *
 * Where there is no Web Audio (the native apps for now), the phone vibrates instead: a tap for
 * a move, a knock for a capture, and the system's success or warning pattern for a win or loss.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { SoundPack } from '@/api/endpoints';
import type { Sound } from '@/game/sounds';

export type GameSound = Sound | 'win' | 'loss';

interface AudioParamLike {
  setValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}
interface AudioNodeLike {
  connect<T>(target: T): T;
}
interface ContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createOscillator(): AudioNodeLike & {
    type: string;
    frequency: AudioParamLike;
    start(time: number): void;
    stop(time: number): void;
  };
  createGain(): AudioNodeLike & { gain: AudioParamLike };
  createBiquadFilter(): AudioNodeLike & {
    type: string;
    frequency: AudioParamLike;
    Q: AudioParamLike;
  };
  createBuffer(
    channels: number,
    length: number,
    rate: number,
  ): { getChannelData(channel: number): Float32Array };
  createBufferSource(): AudioNodeLike & {
    buffer: unknown;
    start(time: number): void;
    stop(time: number): void;
  };
}

const AudioContextClass = (globalThis as { AudioContext?: new () => ContextLike }).AudioContext;
let context: ContextLike | null = null;

export function soundSupported(): boolean {
  return AudioContextClass !== undefined;
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

type Player = (c: ContextLike, t: number) => void;

const PACKS: Record<SoundPack, Record<GameSound, Player>> = {
  gentle: {
    move: (c, t) => tock(c, t, 520, 0.12),
    capture: growl,
    win: fanfare,
    loss: lament,
  },
  woodblock: {
    move: (c, t) => knock(c, t, 880, 0.18),
    capture: (c, t) => {
      knock(c, t, 240, 0.5);
      knock(c, t + 0.12, 170, 0.45);
      noise(c, t, 0.25, 'lowpass', 500, 0.25);
    },
    win: (c, t) => [660, 784, 988, 1319].forEach((f, i) => knock(c, t + i * 0.1, f, 0.2)),
    loss: (c, t) => [392, 262].forEach((f, i) => knock(c, t + i * 0.25, f, 0.2)),
  },
  bells: {
    move: (c, t) => bell(c, t, 1568, 0.06, 0.5, 'sine'),
    capture: gong,
    win: (c, t) =>
      [784, 988, 1175, 1568].forEach((f, i) => bell(c, t + i * 0.14, f, 0.1, 1.2, 'sine')),
    loss: (c, t) => [523, 392].forEach((f, i) => bell(c, t + i * 0.35, f, 0.1, 1.2, 'sine')),
  },
  arcade: {
    move: (c, t) => sweep(c, t, 660, 990, 0.06, 0.07),
    capture: (c, t) => {
      sweep(c, t, 1400, 90, 0.4, 0.14);
      noise(c, t, 0.3, 'highpass', 1200, 0.12);
    },
    win: (c, t) =>
      [523, 659, 784, 1047].forEach((f, i) => sweep(c, t + i * 0.09, f, f, 0.08, 0.08)),
    loss: (c, t) => sweep(c, t, 440, 110, 0.6, 0.1),
  },
};

const FEEL: Record<GameSound, () => Promise<void>> = {
  move: () => Haptics.selectionAsync(),
  capture: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  win: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  loss: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

export function playSound(sound: GameSound, pack: SoundPack = 'gentle'): void {
  if (AudioContextClass === undefined) {
    // A vibration is a nicety too: a phone without a vibrator says no, and that is fine.
    if (Platform.OS !== 'web') FEEL[sound]().catch(() => {});
    return;
  }
  try {
    context ??= new AudioContextClass();
    if (context.state === 'suspended') void context.resume().catch(() => {});
    PACKS[pack][sound](context, context.currentTime + 0.01);
  } catch {
    // A sound is a nicety; never let it break the game.
  }
}

/** A woodblock struck: a bright, very short note over a crack of noise. */
function knock(c: ContextLike, t: number, frequency: number, level: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, t);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.8, t + 0.05);
  envelope(gain.gain, t, level, 0.07);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.09);
  noise(c, t, 0.02, 'highpass', 2500, level * 0.6);
}

/** A gong: a low note with clashing overtones, ringing on. */
function gong(c: ContextLike, t: number) {
  [
    [98, 0.35],
    [98 * 2.76, 0.16],
    [98 * 5.4, 0.08],
  ].forEach(([frequency, level]) => bell(c, t, frequency!, level!, 2.2, 'sine'));
  noise(c, t, 0.15, 'lowpass', 300, 0.3);
}

/** A square-wave note sliding from one pitch to another. */
function sweep(c: ContextLike, t: number, from: number, to: number, length: number, level: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  envelope(gain.gain, t, level, length);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** A short, falling, softly clicking note: a piece set down on wood. */
function tock(c: ContextLike, t: number, frequency: number, level: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, t);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.55, t + 0.09);
  envelope(gain.gain, t, level, 0.14);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.16);
  click(c, t, level * 0.4);
}

/**
 * A tiger takes a goat: a heavy strike, then a rough, wavering snarl that sweeps down, with
 * breath-like noise under it. Much louder than a move.
 */
function growl(c: ContextLike, t: number) {
  // The strike: a deep falling thud.
  const hit = c.createOscillator();
  const hitGain = c.createGain();
  hit.type = 'sine';
  hit.frequency.setValueAtTime(170, t);
  hit.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  envelope(hitGain.gain, t, 0.5, 0.32);
  hit.connect(hitGain).connect(c.destination);
  hit.start(t);
  hit.stop(t + 0.35);

  // The snarl: a buzzing low voice, wobbling fast, its brightness closing down.
  const start = t + 0.04;
  const voice = c.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(130, start);
  voice.frequency.exponentialRampToValueAtTime(70, start + 0.6);
  const wobble = c.createOscillator();
  wobble.type = 'sine';
  wobble.frequency.setValueAtTime(26, start);
  const wobbleDepth = c.createGain();
  wobbleDepth.gain.setValueAtTime(22, start);
  wobble.connect(wobbleDepth).connect(voice.frequency);
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(2400, start);
  tone.frequency.exponentialRampToValueAtTime(350, start + 0.6);
  tone.Q.setValueAtTime(6, start);
  const voiceGain = c.createGain();
  voiceGain.gain.setValueAtTime(0.0001, start);
  voiceGain.gain.exponentialRampToValueAtTime(0.32, start + 0.05);
  voiceGain.gain.exponentialRampToValueAtTime(0.18, start + 0.3);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
  voice.connect(tone).connect(voiceGain).connect(c.destination);
  voice.start(start);
  wobble.start(start);
  voice.stop(start + 0.7);
  wobble.stop(start + 0.7);

  // The breath: rough noise in the same register.
  noise(c, start, 0.6, 'bandpass', 700, 0.22);
}

/** A rising, ringing arpeggio: the game is won. */
function fanfare(c: ContextLike, t: number) {
  [523, 659, 784, 1047].forEach((frequency, i) => bell(c, t + i * 0.11, frequency, 0.14, 0.6));
  bell(c, t + 0.44, 1319, 0.08, 0.9);
}

/** Two soft, falling notes: the game is lost. */
function lament(c: ContextLike, t: number) {
  bell(c, t, 392, 0.12, 0.5);
  bell(c, t + 0.28, 294, 0.12, 0.8);
}

function bell(
  c: ContextLike,
  t: number,
  frequency: number,
  level: number,
  length: number,
  type = 'triangle',
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t);
  envelope(gain.gain, t, level, length);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** Filtered noise, fading out over `length` seconds. */
function noise(
  c: ContextLike,
  t: number,
  length: number,
  type: string,
  frequency: number,
  level: number,
) {
  const samples = Math.floor(c.sampleRate * length);
  const buffer = c.createBuffer(1, samples, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, t);
  const gain = c.createGain();
  envelope(gain.gain, t, level, length);
  source.connect(filter).connect(gain).connect(c.destination);
  source.start(t);
  source.stop(t + length);
}

/** A whisper of filtered noise: the texture of wood in the tock. */
function click(c: ContextLike, t: number, level: number) {
  noise(c, t, 0.03, 'bandpass', 1800, level);
}

function envelope(param: AudioParamLike, t: number, level: number, length: number) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(level, t + 0.006);
  param.exponentialRampToValueAtTime(0.0001, t + length);
}
