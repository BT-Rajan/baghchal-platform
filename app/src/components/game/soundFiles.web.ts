/** The web makes its sounds with Web Audio (synth.ts), so it ships no sound files. */
import type { SoundPack } from '@/api/endpoints';

import type { GameSound } from './synth';

export const SOUND_FILES: Record<SoundPack, Record<GameSound, number>> | null = null;
