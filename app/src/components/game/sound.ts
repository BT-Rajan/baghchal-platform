/**
 * Gentle sounds for moves and captures, made on the spot with the Web Audio API (no sound
 * files): a soft wooden tock for a move, a lower thunk followed by a tock for a capture. Where
 * there is no Web Audio (the native apps for now), there is no sound.
 */
import type { Sound } from '@/game/sounds';

interface AudioParamLike {
  setValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}
interface AudioNodeLike {
  connect<T extends AudioNodeLike>(node: T): T;
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
  createBiquadFilter(): AudioNodeLike & { type: string; frequency: AudioParamLike };
  createBuffer(
    channels: number,
    length: number,
    rate: number,
  ): { getChannelData(channel: number): Float32Array };
  createBufferSource(): AudioNodeLike & {
    buffer: unknown;
    start(time: number): void;
  };
}

const AudioContextClass = (globalThis as { AudioContext?: new () => ContextLike }).AudioContext;
let context: ContextLike | null = null;

export function soundSupported(): boolean {
  return AudioContextClass !== undefined;
}

export function playSound(sound: Sound): void {
  if (AudioContextClass === undefined) return;
  try {
    context ??= new AudioContextClass();
    // Browsers start audio suspended until the page has been clicked or tapped.
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const t = context.currentTime + 0.01;
    if (sound === 'move') {
      tock(context, t, 520, 0.12);
    } else {
      thunk(context, t);
      tock(context, t + 0.09, 680, 0.08);
    }
  } catch {
    // A sound is a nicety; never let it break the game.
  }
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

/** A low, round thunk: a goat taken off the board. */
function thunk(c: ContextLike, t: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.2);
  envelope(gain.gain, t, 0.18, 0.26);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.28);
}

/** A whisper of filtered noise: the texture of wood in the tock. */
function click(c: ContextLike, t: number, level: number) {
  const length = Math.floor(c.sampleRate * 0.03);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, t);
  const gain = c.createGain();
  envelope(gain.gain, t, level, 0.03);
  source.connect(filter).connect(gain).connect(c.destination);
  source.start(t);
}

function envelope(param: AudioParamLike, t: number, level: number, length: number) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(level, t + 0.006);
  param.exponentialRampToValueAtTime(0.0001, t + length);
}
