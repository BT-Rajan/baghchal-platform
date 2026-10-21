// Renders every sound pack (src/components/game/synth.ts, the same graphs the web plays) to small
// WAV files in assets/sounds/, which the Android and iOS apps play. Run from app/ after changing
// a sound, and commit the files: node scripts/render-sounds.mjs
//
// A tiny offline Web Audio: oscillators, gains, biquad filters and buffer sources, with the
// automation synth.ts uses (setValueAtTime, exponentialRampToValueAtTime) and nodes connected to
// parameters (the growl's wobble). Mono, 16-bit, 22.05 kHz; the noise is seeded so the files only
// change when a sound does.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_SOUNDS, PACKS } from '../src/components/game/synth.ts';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

let seed = 0x2545f491;
Math.random = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

class Param {
  constructor(value) {
    this.initial = value;
    this.events = [];
    this.inputs = [];
  }
  setValueAtTime(value, time) {
    this.events.push({ kind: 'set', value, time });
    this.events.sort((a, b) => a.time - b.time);
  }
  exponentialRampToValueAtTime(value, time) {
    this.events.push({ kind: 'ramp', value, time });
    this.events.sort((a, b) => a.time - b.time);
  }
  /** The automated value at `time`, plus whatever is connected to the parameter. */
  value(time, index) {
    let value = this.initial;
    let from = { value: this.initial, time: 0 };
    for (const event of this.events) {
      if (event.time <= time) {
        value = event.value;
        from = event;
        continue;
      }
      if (event.kind === 'ramp') {
        const span = event.time - from.time;
        value = from.value * (event.value / from.value) ** ((time - from.time) / span);
      }
      break;
    }
    for (const node of this.inputs) value += node.output(index);
    return value;
  }
}

class Node {
  constructor(context) {
    this.context = context;
    this.inputs = [];
    this.at = -1;
    this.last = 0;
  }
  connect(target) {
    target.inputs.push(this);
    return target;
  }
  input(index) {
    let sum = 0;
    for (const node of this.inputs) sum += node.output(index);
    return sum;
  }
  output(index) {
    if (this.at !== index) {
      this.at = index;
      this.last = this.compute(index, index / RATE);
    }
    return this.last;
  }
}

class Scheduled extends Node {
  begin = Infinity;
  end = Infinity;
  start(time) {
    this.begin = time;
  }
  stop(time) {
    this.end = time;
    this.context.until = Math.max(this.context.until, time);
  }
  playing(time) {
    return time >= this.begin && time < this.end;
  }
}

class Oscillator extends Scheduled {
  type = 'sine';
  frequency = new Param(440);
  phase = 0;
  compute(index, time) {
    const frequency = this.frequency.value(time, index);
    if (!this.playing(time)) return 0;
    const p = this.phase;
    this.phase = (p + frequency / RATE) % 1;
    switch (this.type) {
      case 'square':
        return p < 0.5 ? 1 : -1;
      case 'sawtooth':
        return 2 * ((p + 0.5) % 1) - 1;
      case 'triangle':
        return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      default:
        return Math.sin(2 * Math.PI * p);
    }
  }
}

class Gain extends Node {
  gain = new Param(1);
  compute(index, time) {
    return this.input(index) * this.gain.value(time, index);
  }
}

/** The Web Audio spec's biquads (lowpass and highpass take Q in dB, bandpass as a ratio). */
class Filter extends Node {
  type = 'lowpass';
  frequency = new Param(350);
  Q = new Param(1);
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  compute(index, time) {
    const x = this.input(index);
    const w = (2 * Math.PI * Math.min(this.frequency.value(time, index), RATE / 2 - 1)) / RATE;
    const q = this.Q.value(time, index);
    const cos = Math.cos(w);
    let b0, b1, b2, alpha;
    if (this.type === 'bandpass') {
      alpha = Math.sin(w) / (2 * q);
      [b0, b1, b2] = [alpha, 0, -alpha];
    } else {
      alpha = Math.sin(w) / (2 * 10 ** (q / 20));
      [b0, b1, b2] =
        this.type === 'highpass'
          ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
          : [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    }
    const [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
    const y = (b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2) / a0;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

class BufferSource extends Scheduled {
  buffer = null;
  compute(_index, time) {
    if (!this.playing(time) || this.buffer === null) return 0;
    const data = this.buffer.getChannelData(0);
    return data[Math.floor((time - this.begin) * RATE)] ?? 0;
  }
}

class OfflineContext {
  currentTime = 0;
  state = 'running';
  sampleRate = RATE;
  until = 0;
  destination = new Node(this);
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return new Oscillator(this);
  }
  createGain() {
    return new Gain(this);
  }
  createBiquadFilter() {
    return new Filter(this);
  }
  createBufferSource() {
    return new BufferSource(this);
  }
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  render() {
    const samples = Math.ceil((this.until + 0.02) * RATE);
    const out = new Int16Array(samples);
    for (let i = 0; i < samples; i++) {
      const value = Math.max(-1, Math.min(1, this.destination.input(i)));
      out[i] = Math.round(value * 32767);
    }
    return out;
  }
}

function wav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

mkdirSync(OUT, { recursive: true });
for (const [pack, sounds] of Object.entries(PACKS)) {
  for (const sound of GAME_SOUNDS) {
    const context = new OfflineContext();
    sounds[sound](context, 0);
    const file = join(OUT, `${pack}-${sound}.wav`);
    writeFileSync(file, wav(context.render()));
    console.log(file);
  }
}
