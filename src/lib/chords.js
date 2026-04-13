import { getScaleNotes, midiToNote } from './scales.js';

// Functional harmony groups — Markov chain transitions
// tonic → anything, predominant → dominant or tonic, dominant → tonic (or deceptive vi)
const HARMONY_GROUPS = {
  major:      { T: [0,2], P: [1,3], D: [4,6] },  // I,iii / ii,IV / V,vii
  minor:      { T: [0,5], P: [1,3], D: [4,6] },  // i,bVI / ii°,bIII / V,bVII
  dorian:     { T: [0,2], P: [1,3], D: [4,6] },
  mixolydian: { T: [0,2], P: [3,5], D: [6,4] },
  // Modal/pentatonic — use looser circular motion
  pentatonic: null,
  minor_pent: null,
  hirajoshi:  null,
};

// Markov weights: [T→T, T→P, T→D, P→T, P→P, P→D, D→T, D→P, D→D]
// Strong drive: D→T; deceptive: D→vi (included in T group); rare backward motion
const MARKOV = {
  T: { T: 0.15, P: 0.5,  D: 0.35 },
  P: { T: 0.25, P: 0.1,  D: 0.65 },
  D: { T: 0.75, P: 0.05, D: 0.2  },  // 0.2 D→D allows dominant extension
};

// Variable harmonic rhythm — weighted duration pool
// Tonic chords linger, dominant chords drive forward
const DURATIONS_LONG  = ['4m', '4m', '2m'];          // tonic at phrase start/end
const DURATIONS_MID   = ['2m', '2m', '1m', '4m'];    // general
const DURATIONS_SHORT = ['1m', '1m', '2n'];           // dominant, passing

// Build a 4-note chord (root + diatonic 3rd + 5th + 7th)
export function buildChord(root, scaleName, degree) {
  const all  = getScaleNotes(root, scaleName);
  const oct3 = all.filter(m => Math.floor(m / 12) - 1 === 3);
  const len  = oct3.length;
  if (len === 0) return [];
  const d = ((degree % len) + len) % len;
  return [
    oct3[d % len],
    oct3[(d + 2) % len],
    oct3[(d + 4) % len],
    oct3[(d + 6) % len],
  ].map(midiToNote);
}

// Rootless voicing: 3rd + 7th (+ 9th if available) — jazz warmth, avoids blockiness
export function buildRootlessVoicing(root, scaleName, degree) {
  const all  = getScaleNotes(root, scaleName);
  const oct3 = all.filter(m => Math.floor(m / 12) - 1 === 3);
  const len  = oct3.length;
  if (len < 3) return buildChord(root, scaleName, degree);
  const d = ((degree % len) + len) % len;
  // 3rd + 7th in octave 3, add 9th up an octave if scale has enough notes
  const third  = midiToNote(oct3[(d + 2) % len]);
  const seventh = midiToNote(oct3[(d + 6) % len]);
  const ninth  = len >= 5 ? midiToNote(oct3[(d + 1) % len] + 12) : null; // 9th = 2nd up octave
  return ninth ? [third, seventh, ninth] : [third, seventh];
}

export function buildArpPool(chordNotes) {
  const names = chordNotes.map(n => n.replace(/\d+$/, ''));
  const pool  = [];
  for (let oct = 3; oct <= 5; oct++) {
    names.forEach(name => pool.push(name + oct));
  }
  return pool;
}

function pickWeightedObj(obj) {
  const keys   = Object.keys(obj);
  const total  = keys.reduce((s, k) => s + obj[k], 0);
  let r = Math.random() * total;
  for (const k of keys) { r -= obj[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Returns { chord, rootlessPad, degree, duration, isHirajoshi, isModal }
export function createProgressionGenerator(root, scaleName) {
  const groups  = HARMONY_GROUPS[scaleName] ?? null;
  const isModal = !groups;  // pentatonic/hirajoshi use circular motion

  // Modal: simple circular motion among scale degrees
  if (isModal) {
    const modalDegrees = {
      pentatonic: [0, 2, 1, 3, 0, 2, 4, 0],
      minor_pent: [0, 2, 3, 1, 0, 3, 1, 0],
      hirajoshi:  [0, 0, 1, 2, 0, 0, 1, 3],  // heavy tonic pedal for Japanese ma feel
    };
    const seq = modalDegrees[scaleName] ?? modalDegrees.pentatonic;
    let step = 0;
    return function next() {
      const degree   = seq[step % seq.length];
      const isLong   = (step % seq.length === 0) || (step % seq.length === seq.length - 1);
      const dur      = isLong ? pickFrom(DURATIONS_LONG) : pickFrom(DURATIONS_MID);
      step++;
      return {
        chord:       buildChord(root, scaleName, degree),
        rootlessPad: buildRootlessVoicing(root, scaleName, degree),
        degree,
        duration:    dur,
        isModal:     true,
      };
    };
  }

  // Functional: Markov chain over T/P/D groups
  const { T, P, D } = groups;
  let currentGroup = 'T';
  let phraseCount  = 0;

  return function next() {
    phraseCount++;

    // Every 4 chords, force a cadence: P→D→T for resolution
    const isCadenceApproach = (phraseCount % 4 === 3);
    const isCadenceLand     = (phraseCount % 4 === 0);

    let nextGroup;
    if (isCadenceLand)     nextGroup = 'T';
    else if (isCadenceApproach) nextGroup = 'D';
    else nextGroup = pickWeightedObj(MARKOV[currentGroup]);

    // Deceptive cadence: 20% of D→T resolutions go to vi instead
    let degreePool = nextGroup === 'T' ? T
                   : nextGroup === 'P' ? P
                   : D;
    if (currentGroup === 'D' && nextGroup === 'T' && Math.random() < 0.2) {
      // Deceptive: resolve to vi (index 5 in major, included in T group)
      degreePool = T;
    }

    const degree = pickFrom(degreePool);
    currentGroup = nextGroup;

    // Duration: tonic gets long, dominant gets short, predominant gets mid
    const durPool = nextGroup === 'T' ? (isCadenceLand ? DURATIONS_LONG : DURATIONS_MID)
                  : nextGroup === 'D' ? DURATIONS_SHORT
                  : DURATIONS_MID;
    const duration = pickFrom(durPool);

    return {
      chord:       buildChord(root, scaleName, degree),
      rootlessPad: buildRootlessVoicing(root, scaleName, degree),
      degree,
      duration,
      isModal: false,
    };
  };
}
