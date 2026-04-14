// Instrument presets — defines synth params for all voices.
// v1 is PolySynth(FMSynth), v2/v3/pad/chord/harmony are PolySynth(Synth),
// subBass is MonoSynth. Applied via .set() so the generative engine is untouched.

export const PRESETS = {
  ethereal: {
    name: 'Ethereal',
    v1: {
      harmonicity: 1.005, modulationIndex: 2,
      oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
      envelope:           { attack: 0.25, decay: 0.4,  sustain: 0.7,  release: 2.5 },
      modulationEnvelope: { attack: 0.8,  decay: 0.5,  sustain: 0.3,  release: 2.0 },
      volume: -11,
    },
    v2:      { oscillator: { type: 'sine' },     envelope: { attack: 0.12, decay: 0.3, sustain: 0.6,  release: 3.0 }, volume: -17 },
    v3:      { oscillator: { type: 'triangle' }, envelope: { attack: 0.5,  decay: 0.4, sustain: 0.8,  release: 4.0 }, volume: -14 },
    pad:     { oscillator: { type: 'triangle' }, envelope: { attack: 0.4,  decay: 0.3, sustain: 0.9,  release: 6.0 }, volume: -15 },
    chord:   { oscillator: { type: 'sine' },     envelope: { attack: 0.8,  decay: 0.5, sustain: 0.8,  release: 5.0 }, volume: -16 },
    harmony: { oscillator: { type: 'sine' },     envelope: { attack: 2.5,  decay: 0.5, sustain: 0.85, release: 6.0 }, volume: -19 },
    subBass: { oscillator: { type: 'sine' },     envelope: { attack: 2.5,  decay: 0.5, sustain: 0.9,  release: 6.0 }, volume: -13 },
  },

  strings: {
    name: 'Strings',
    v1: {
      harmonicity: 0.5, modulationIndex: 0.4,
      oscillator: { type: 'sawtooth' }, modulation: { type: 'sawtooth' },
      envelope:           { attack: 0.9,  decay: 0.3, sustain: 0.85, release: 4.0 },
      modulationEnvelope: { attack: 1.2,  decay: 0.4, sustain: 0.5,  release: 3.5 },
      volume: -10,
    },
    v2:      { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.6,  decay: 0.2, sustain: 0.8,  release: 4.5 }, volume: -16 },
    v3:      { oscillator: { type: 'sawtooth' }, envelope: { attack: 1.2,  decay: 0.4, sustain: 0.9,  release: 5.5 }, volume: -13 },
    pad:     { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.5,  decay: 0.3, sustain: 0.9,  release: 7.0 }, volume: -15 },
    chord:   { oscillator: { type: 'sawtooth' }, envelope: { attack: 1.0,  decay: 0.5, sustain: 0.8,  release: 6.0 }, volume: -15 },
    harmony: { oscillator: { type: 'sawtooth' }, envelope: { attack: 2.8,  decay: 0.5, sustain: 0.85, release: 7.0 }, volume: -18 },
    subBass: { oscillator: { type: 'sawtooth' }, envelope: { attack: 1.0,  decay: 0.4, sustain: 0.9,  release: 6.0 }, volume: -12 },
  },

  glass: {
    name: 'Glass',
    v1: {
      harmonicity: 3, modulationIndex: 0.15,
      oscillator: { type: 'sine' }, modulation: { type: 'sine' },
      envelope:           { attack: 0.01, decay: 0.7,  sustain: 0.08, release: 2.5 },
      modulationEnvelope: { attack: 0.02, decay: 0.5,  sustain: 0.04, release: 2.0 },
      volume: -11,
    },
    v2:      { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.5,  sustain: 0.05, release: 2.0 }, volume: -14 },
    v3:      { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 1.0,  sustain: 0.1,  release: 3.5 }, volume: -13 },
    pad:     { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 1.2,  sustain: 0.15, release: 4.0 }, volume: -15 },
    chord:   { oscillator: { type: 'sine' }, envelope: { attack: 0.05, decay: 0.8,  sustain: 0.1,  release: 4.0 }, volume: -16 },
    harmony: { oscillator: { type: 'sine' }, envelope: { attack: 0.08, decay: 1.0,  sustain: 0.12, release: 5.0 }, volume: -18 },
    subBass: { oscillator: { type: 'sine' }, envelope: { attack: 0.1,  decay: 1.5,  sustain: 0.2,  release: 5.0 }, volume: -13 },
  },

  progressive: {
    name: 'Progressive',
    // Fat detuned sawtooth — multiple oscillator voices create the super-saw width
    // characteristic of deadmau5 / progressive house pads
    v1: {
      harmonicity: 0.5, modulationIndex: 0.15,
      oscillator: { type: 'fatsawtooth', count: 2, spread: 20 },
      modulation: { type: 'sawtooth' },
      envelope:           { attack: 0.7,  decay: 0.4, sustain: 0.9,  release: 4.5 },
      modulationEnvelope: { attack: 1.0,  decay: 0.5, sustain: 0.6,  release: 4.0 },
      volume: -12,
    },
    v2:      { oscillator: { type: 'fatsawtooth', count: 2, spread: 15 }, envelope: { attack: 0.4,  decay: 0.3, sustain: 0.85, release: 5.0 }, volume: -17 },
    v3:      { oscillator: { type: 'sawtooth' },                          envelope: { attack: 1.0,  decay: 0.4, sustain: 0.9,  release: 5.5 }, volume: -14 },
    pad:     { oscillator: { type: 'fatsawtooth', count: 2, spread: 20 }, envelope: { attack: 0.6,  decay: 0.3, sustain: 0.9,  release: 7.0 }, volume: -14 },
    chord:   { oscillator: { type: 'fatsawtooth', count: 2, spread: 20 }, envelope: { attack: 1.0,  decay: 0.5, sustain: 0.9,  release: 7.0 }, volume: -14 },
    harmony: { oscillator: { type: 'fatsawtooth', count: 2, spread: 15 }, envelope: { attack: 2.5,  decay: 0.5, sustain: 0.9,  release: 8.0 }, volume: -17 },
    subBass: { oscillator: { type: 'sawtooth' },                          envelope: { attack: 0.6,  decay: 0.4, sustain: 0.9,  release: 6.0 }, volume: -11 },
  },

  organ: {
    name: 'Organ',
    v1: {
      harmonicity: 2, modulationIndex: 0.6,
      oscillator: { type: 'square' }, modulation: { type: 'sine' },
      envelope:           { attack: 0.01, decay: 0.05, sustain: 0.95, release: 0.25 },
      modulationEnvelope: { attack: 0.01, decay: 0.05, sustain: 0.8,  release: 0.2  },
      volume: -13,
    },
    v2:      { oscillator: { type: 'sine'   }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.9,  release: 0.3  }, volume: -19 },
    v3:      { oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.95, release: 0.25 }, volume: -15 },
    pad:     { oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.95, release: 0.3  }, volume: -16 },
    chord:   { oscillator: { type: 'sine'   }, envelope: { attack: 0.02, decay: 0.05, sustain: 0.9,  release: 0.3  }, volume: -17 },
    harmony: { oscillator: { type: 'sine'   }, envelope: { attack: 0.05, decay: 0.05, sustain: 0.9,  release: 0.3  }, volume: -20 },
    subBass: { oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.95, release: 0.3  }, volume: -14 },
  },
};
