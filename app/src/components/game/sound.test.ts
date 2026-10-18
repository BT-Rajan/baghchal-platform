/** Every pack plays every sound through Web Audio without throwing. */
const node = () => {
  const param = { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() };
  return {
    type: '',
    frequency: param,
    gain: param,
    Q: param,
    buffer: null as unknown,
    connect: jest.fn((target: unknown) => target),
    start: jest.fn(),
    stop: jest.fn(),
  };
};

class FakeContext {
  currentTime = 0;
  state = 'suspended';
  sampleRate = 8000;
  destination = node();
  static oscillators = 0;
  resume = jest.fn(() => Promise.resolve());
  createOscillator() {
    FakeContext.oscillators += 1;
    return node();
  }
  createGain = node;
  createBiquadFilter = node;
  createBufferSource = node;
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

test('each pack, each sound', () => {
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeContext;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { playSound, soundSupported } = require('./sound') as typeof import('./sound');
    expect(soundSupported()).toBe(true);
    for (const pack of ['gentle', 'woodblock', 'bells', 'arcade'] as const) {
      for (const sound of ['move', 'capture', 'win', 'loss'] as const) {
        const before = FakeContext.oscillators;
        playSound(sound, pack);
        expect(FakeContext.oscillators).toBeGreaterThan(before);
      }
    }
    playSound('move'); // gentle unless told otherwise
  });
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
});
