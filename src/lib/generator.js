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

// Weighted random duration selection from a { dur: weight } pool
function pickDuration(pool) {
  const keys = Object.keys(pool);
  const vals = keys.map(k => pool[k]);
  return pickWeighted(keys, vals);
}

// An autonomous generative voice. Reads from shared harmonicCtx + moodRef,
// makes musical decisions (pitch weights, interval memory, motif replay, contour).
export class GenerativeVoice {
  constructor({ synth, harmonicCtx, moodRef, midiMin = 48, midiMax = 83,
                noteDur = '8n', durationPool = null, restProb = 0.12 }) {
    this.synth        = synth;
    this.harmonicCtx  = harmonicCtx;
    this.moodRef      = moodRef;
    this.midiMin      = midiMin;
    this.midiMax      = midiMax;
    this.noteDur      = noteDur;
    this.durationPool = durationPool; // { '8n': 0.4, '4n': 0.3, ... } overrides noteDur
    this.restProb     = restProb;     // independent breath rest probability

    this.motifBuf    = [];
    this.lastMidi    = null;
    this.lastDelta   = 0;

    // Melodic contour: slow arc over 7–11 notes (-1 low bias, +1 high bias)
    this.contourPhase = 0;
    this.contourLen   = 7 + Math.floor(Math.random() * 5);
    this.contourDir   = Math.random() < 0.5 ? 1 : -1;
    this.contourValue = 0;

    // Velocity: slow random walk
    this.velocityBase = 0.45 + Math.random() * 0.15;

    // Voice leading: track last chord seen to detect changes
    this.lastChordKey = '';
  }

  tick(time) {
    const density = this.moodRef.current?.density ?? 0.55;
    if (Math.random() > density) return;
    if (Math.random() < this.restProb) return; // breath rest

    const pool = this.getPool();
    if (pool.length === 0) return;

    const currentChordMidis = this.harmonicCtx.current?.chordMidis ?? [];
    const chordKey = currentChordMidis.join(',');
    const chordChanged = chordKey !== this.lastChordKey;
    this.lastChordKey = chordKey;

    let note;
    if (chordChanged && this.lastMidi !== null) {
      // Voice lead: move to nearest chord tone on chord change
      note = this.voiceLead(pool, currentChordMidis);
    } else if (this.motifBuf.length >= 3 && Math.random() < 0.4) {
      note = this.fromMotif(pool);
    } else {
      note = this.generate(pool);
    }

    if (!note) return;

    // Advance contour arc
    this.contourPhase++;
    if (this.contourPhase >= this.contourLen) {
      this.contourPhase = 0;
      this.contourDir   = -this.contourDir;
      this.contourLen   = 7 + Math.floor(Math.random() * 5);
    }
    const t = this.contourPhase / this.contourLen;
    this.contourValue = Math.sin(t * Math.PI) * this.contourDir;

    // Update memory
    const midi = noteToMidi(note);
    this.lastDelta = this.lastMidi !== null ? midi - this.lastMidi : 0;
    this.lastMidi  = midi;
    this.motifBuf.push(note);
    if (this.motifBuf.length > 5) this.motifBuf.shift();

    // Velocity: contour peak = louder, chord tone = louder, slow walk
    const chordPcs    = currentChordMidis.map(m => ((m % 12) + 12) % 12);
    const pc          = ((midi % 12) + 12) % 12;
    const isChordTone = chordPcs.includes(pc);
    const contourBoost = this.contourValue * 0.15;
    const chordBoost   = isChordTone ? 0.08 : -0.06;
    this.velocityBase  = Math.max(0.28, Math.min(0.88,
      this.velocityBase + (Math.random() - 0.5) * 0.04));
    const velocity = Math.max(0.15, Math.min(0.95,
      this.velocityBase + contourBoost + chordBoost));

    const jitter = (Math.random() - 0.5) * 0.02;
    const dur    = this.durationPool ? pickDuration(this.durationPool) : this.noteDur;

    this.synth.triggerAttackRelease(note, dur, time + Math.max(0, jitter), velocity);
  }

  getPool() {
    const all      = this.harmonicCtx.current?.arpPool ?? [];
    const filtered = all.filter(n => {
      const m = noteToMidi(n);
      return m >= this.midiMin && m <= this.midiMax;
    });
    return filtered.length >= 2 ? filtered : all;
  }

  // Find nearest chord tone in pool to lastMidi for smooth transition
  voiceLead(pool, chordMidis) {
    if (!this.lastMidi || chordMidis.length === 0) return this.generate(pool);
    const chordPcs = chordMidis.map(c => ((c % 12) + 12) % 12);
    let bestNote = null, bestDist = Infinity;
    for (const note of pool) {
      const m  = noteToMidi(note);
      const pc = ((m % 12) + 12) % 12;
      if (!chordPcs.includes(pc)) continue;
      const dist = Math.abs(m - this.lastMidi);
      if (dist < bestDist) { bestDist = dist; bestNote = note; }
    }
    return bestNote ?? this.generate(pool);
  }

  generate(pool) {
    const chordMidis = this.harmonicCtx.current?.chordMidis ?? [];
    const tension    = this.moodRef.current?.tension ?? 0;
    const userW      = this.moodRef.current?.userPitchWeights ?? {};
    const midRange   = (this.midiMin + this.midiMax) / 2;

    const weights = pool.map(note => {
      const midi = noteToMidi(note);
      let w = 1.0;

      // Chord tone bias — loosens at high tension to allow extensions
      const pc       = ((midi % 12) + 12) % 12;
      const chordPcs = chordMidis.map(m => ((m % 12) + 12) % 12);
      const chordBias = 1.5 + (1 - tension) * 1.5; // 1.5 tense → 3.0 resolved
      if (chordPcs.includes(pc)) w *= chordBias;
      else if (tension > 0.6)    w *= (0.5 + tension * 0.5); // extensions ok at tension

      // User pitch class boost
      const name = note.replace(/\d+$/, '');
      if (userW[name]) w *= (1 + userW[name] * 2);

      // Contour bias: positive = favor higher notes in range
      const normalised = (midi - midRange) / ((this.midiMax - this.midiMin) / 2 || 1);
      w *= Math.exp(this.contourValue * normalised * 2.5);

      // Interval memory: penalize leaps, reward stepwise recovery
      if (this.lastMidi !== null) {
        const delta = midi - this.lastMidi;
        if (Math.abs(delta) > 9)      w *= 0.2;
        else if (Math.abs(delta) > 5) w *= 0.6;
        if (Math.abs(this.lastDelta) > 5) {
          const recoverDir = this.lastDelta > 0 ? -1 : 1;
          if (Math.sign(delta) === recoverDir && Math.abs(delta) <= 4) w *= 2.2;
        }
      }

      // Tessitura gravity: pull back toward midpoint when drifted far
      const drift = Math.abs(midi - midRange) / ((this.midiMax - this.midiMin) / 2 || 1);
      if (drift > 0.7) w *= Math.max(0.3, 1 - (drift - 0.7) * 1.5);

      return Math.max(0.01, w);
    });

    return pickWeighted(pool, weights);
  }

  fromMotif(pool) {
    if (!this.motifBuf.length) return this.generate(pool);
    const motif = [...this.motifBuf];
    const roll  = Math.random();

    if (roll < 0.15) {
      // Inversion: flip interval around first note
      const rootMidi = noteToMidi(motif[0]);
      const srcMidi  = noteToMidi(motif[Math.floor(Math.random() * motif.length)]);
      return this._findNearest(pool, rootMidi - (srcMidi - rootMidi));
    } else if (roll < 0.25) {
      // Retrograde: reversed motif
      return [...motif].reverse()[Math.floor(Math.random() * motif.length)];
    } else if (roll < 0.35) {
      // Sequence: transpose by ±2 semitones (approximate step)
      const delta = Math.random() < 0.5 ? 2 : -2;
      const src   = noteToMidi(motif[Math.floor(Math.random() * motif.length)]);
      return this._findNearest(pool, src + delta);
    } else if (roll < 0.60) {
      // One-note variation
      motif[Math.floor(Math.random() * motif.length)] =
        pool[Math.floor(Math.random() * pool.length)];
      return motif[Math.floor(Math.random() * motif.length)];
    } else {
      // Straight replay
      return motif[Math.floor(Math.random() * motif.length)];
    }
  }

  _findNearest(pool, targetMidi) {
    let best = pool[0], bestDist = Infinity;
    for (const note of pool) {
      const d = Math.abs(noteToMidi(note) - targetMidi);
      if (d < bestDist) { bestDist = d; best = note; }
    }
    return best;
  }

  reset() {
    this.motifBuf     = [];
    this.lastMidi     = null;
    this.lastDelta    = 0;
    this.contourPhase = 0;
    this.contourDir   = Math.random() < 0.5 ? 1 : -1;
    this.lastChordKey = '';
  }
}
