/** The rendered sound packs the apps play (made by scripts/render-sounds.mjs from synth.ts). */
import type { SoundPack } from '@/api/endpoints';

import type { GameSound } from './synth';

export const SOUND_FILES: Record<SoundPack, Record<GameSound, number>> | null = {
  gentle: {
    move: require('../../../assets/sounds/gentle-move.wav'),
    capture: require('../../../assets/sounds/gentle-capture.wav'),
    win: require('../../../assets/sounds/gentle-win.wav'),
    loss: require('../../../assets/sounds/gentle-loss.wav'),
  },
  woodblock: {
    move: require('../../../assets/sounds/woodblock-move.wav'),
    capture: require('../../../assets/sounds/woodblock-capture.wav'),
    win: require('../../../assets/sounds/woodblock-win.wav'),
    loss: require('../../../assets/sounds/woodblock-loss.wav'),
  },
  bells: {
    move: require('../../../assets/sounds/bells-move.wav'),
    capture: require('../../../assets/sounds/bells-capture.wav'),
    win: require('../../../assets/sounds/bells-win.wav'),
    loss: require('../../../assets/sounds/bells-loss.wav'),
  },
  arcade: {
    move: require('../../../assets/sounds/arcade-move.wav'),
    capture: require('../../../assets/sounds/arcade-capture.wav'),
    win: require('../../../assets/sounds/arcade-win.wav'),
    loss: require('../../../assets/sounds/arcade-loss.wav'),
  },
};
