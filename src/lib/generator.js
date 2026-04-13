import { noteToMidi } from './scales.js';

export function pickWeighted(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// An autonomous generative voice. Reads from shared harmonicCtx + moodRef,
// makes musical decisions (pitch weights, interval memory, motif replay).
export class GenerativeVoice {
  constructor({ synth, harmonicCtx, moodRef, midiMin = 48, midiMax = 83, noteDur = '8n' }) {
    this.synth       = synth;
    this.harmonicCtx = harmonicCtx;
    this.moodRef     = moodRef;
    this.midiMin     = midiMin;
    this.midiMax     = midiMax;
    this.noteDur     = noteDur;
    this.motifBuf    = [];   // last 5 notes played — used for motif replay
    this.lastMidi    = null;
    this.lastDelta   = 0;    // interval of last move, for recovery bias
  }

  tick(time) {
    const density = this.moodRef.current?.density ?? 0.55;
    if (Math.random() > density) return; // rest

    const pool = this.getPool();
    if (pool.length === 0) return;

    // 40% motif replay (creates repetition the ear reads as "intentional")
    // 60% fresh probabilistic generation
    const note = (this.motifBuf.length >= 3 && Math.random() < 0.4)
      ? this.fromMotif(pool)
      : this.generate(pool);

    if (!note) return;

    // Update memory
    const midi = noteToMidi(note);
    this.lastDelta = this.lastMidi !== null ? midi - this.lastMidi : 0;
    this.lastMidi  = midi;
    this.motifBuf.push(note);
    if (this.motifBuf.length > 5) this.motifBuf.shift();

    // Humanize timing and velocity
    const jitter   = (Math.random() - 0.5) * 0.018;
    const isAccent = Math.random() < 0.25; // occasional accent
    const velocity = isAccent ? 0.65 + Math.random() * 0.25 : 0.3 + Math.random() * 0.35;

    this.synth.triggerAttackRelease(note, this.noteDur, time + Math.max(0, jitter), velocity);
  }

  // Filter the global arp pool to this voice's register range
  getPool() {
    const all      = this.harmonicCtx.current?.arpPool ?? [];
    const filtered = all.filter(n => {
      const m = noteToMidi(n);
      return m >= this.midiMin && m <= this.midiMax;
    });
    return filtered.length >= 2 ? filtered : all;
  }

  // Probabilistic note selection with three layers of bias:
  // 1. Chord tones get higher weight (always consonant)
  // 2. User pitch class boosts (typing influence)
  // 3. Interval memory (stepwise recovery after leaps)
  generate(pool) {
    const chordMidis = this.harmonicCtx.current?.chordMidis ?? [];
    const userW      = this.moodRef.current?.userPitchWeights ?? {};

    const weights = pool.map(note => {
      const midi = noteToMidi(note);
      let w = 1.0;

      // Chord tone bias
      const pc      = ((midi % 12) + 12) % 12;
      const chordPcs = chordMidis.map(m => ((m % 12) + 12) % 12);
      if (chordPcs.includes(pc)) w *= 2.5;

      // User pitch class boost (from recent keypresses)
      const name = note.replace(/\d+$/, '');
      if (userW[name]) w *= (1 + userW[name] * 2);

      // Interval memory: penalize large leaps, reward recovery
      if (this.lastMidi !== null) {
        const delta = midi - this.lastMidi;
        if (Math.abs(delta) > 9)      w *= 0.2;  // heavily penalize 7th+ leaps
        else if (Math.abs(delta) > 5) w *= 0.6;  // softer penalty for 5th/6th

        // After a leap, bias toward stepwise motion back (vocal phrasing rule)
        if (Math.abs(this.lastDelta) > 5) {
          const recoverDir = this.lastDelta > 0 ? -1 : 1;
          if (Math.sign(delta) === recoverDir && Math.abs(delta) <= 4) w *= 2.2;
        }
      }

      return Math.max(0.01, w);
    });

    return pickWeighted(pool, weights);
  }

  // Replay from motif buffer with occasional one-note variation
  fromMotif(pool) {
    if (!this.motifBuf.length) return this.generate(pool);
    const motif = [...this.motifBuf];
    // 25% chance to vary one note — keeps it from being mechanical repetition
    if (Math.random() < 0.25) {
      motif[Math.floor(Math.random() * motif.length)] =
        pool[Math.floor(Math.random() * pool.length)];
    }
    return motif[Math.floor(Math.random() * motif.length)];
  }

  reset() {
    this.motifBuf  = [];
    this.lastMidi  = null;
    this.lastDelta = 0;
  }
}
