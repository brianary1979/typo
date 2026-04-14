import * as Tone from 'tone';

// 16-step pattern — 1 = always, 0 = never, 0.x = probability
const KICK  = [1, 0, 0, 0,  0, 0, 0.18, 0,  1, 0, 0, 0.12,  0, 0, 0.15, 0];
const SNARE = [0, 0, 0, 0,  1, 0, 0,    0,  0, 0, 0, 0,     1, 0, 0,    0.1];
const HIHAT = [0.8, 0, 0.85, 0,  0.8, 0, 0.85, 0,  0.8, 0, 0.85, 0,  0.8, 0, 0.85, 0.4];

export function createDrums(destination) {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.055,
    octaves: 7,
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.1 },
    volume: -6,
  }).connect(destination);

  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.04 },
    volume: -16,
  }).connect(destination);

  const hihatHpf = new Tone.Filter({ frequency: 7000, type: 'highpass' }).connect(destination);
  const hihat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
    volume: -24,
  }).connect(hihatHpf);

  let step = 0;

  const loop = new Tone.Loop((time) => {
    const s = step % 16;

    const kv = KICK[s];
    if (kv === 1 || (kv > 0 && Math.random() < kv)) {
      kick.triggerAttackRelease('C1', '8n', time, 0.72 + Math.random() * 0.22);
    }

    const sv = SNARE[s];
    if (sv === 1 || (sv > 0 && Math.random() < sv)) {
      snare.triggerAttackRelease('8n', time, 0.45 + Math.random() * 0.3);
    }

    const hv = HIHAT[s];
    if (hv > 0 && Math.random() < hv) {
      hihat.triggerAttackRelease('16n', time, 0.25 + Math.random() * 0.3);
    }

    step++;
  }, '16n');

  return {
    start() { step = 0; loop.start(0); },
    stop()  { loop.stop(); },
    dispose() {
      loop.dispose();
      kick.dispose();
      snare.dispose();
      hihat.dispose();
      hihatHpf.dispose();
    },
  };
}
