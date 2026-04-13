import { getScaleNotes, midiToNote } from './scales.js';

// Weighted progressions by scale degree index (0=I, 1=ii, 2=iii etc.)
// Each entry: [nextDegree, weight]
const TRANSITIONS = {
  0: [[3, 3], [4, 3], [5, 2], [1, 1]],  // I  → IV, V, vi, ii
  1: [[4, 4], [0, 2], [5, 1]],           // ii → V, I, vi
  2: [[5, 3], [3, 2]],                   // iii→ vi, IV
  3: [[0, 3], [4, 3], [1, 2]],           // IV → I, V, ii
  4: [[0, 5], [5, 2]],                   // V  → I, vi (strong resolution)
  5: [[3, 3], [1, 2], [4, 1]],           // vi → IV, ii, V
  6: [[0, 4], [4, 2]],                   // vii→ I, V
};

function weightedPick(options) {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [val, w] of options) {
    r -= w;
    if (r <= 0) return val;
  }
  return options[0][0];
}

// Returns a chord (array of Tone.js note strings) for the given scale degree
export function buildChord(root, scaleName, degree) {
  const notes = getScaleNotes(root, scaleName);
  // Use octave 3 as chord base
  const octave3 = notes.filter(m => Math.floor(m / 12) - 1 === 3);
  const scaleLen = octave3.length;
  if (scaleLen === 0) return [];

  const rootNote  = octave3[degree % scaleLen];
  const thirdNote = octave3[(degree + 2) % scaleLen];
  const fifthNote = octave3[(degree + 4) % scaleLen];

  return [rootNote, thirdNote, fifthNote].map(midiToNote);
}

// Simple stateful progression generator
export function createProgressionGenerator(root, scaleName) {
  let currentDegree = 0;

  return function next() {
    const chord = buildChord(root, scaleName, currentDegree);
    const options = TRANSITIONS[currentDegree] ?? [[0, 1]];
    currentDegree = weightedPick(options);
    return chord;
  };
}
