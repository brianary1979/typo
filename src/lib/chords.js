import { getScaleNotes, midiToNote, SCALES } from './scales.js';

// Functional harmony groups per scale
// Dorian: P = only degree 3 (IV major — the characteristic Dorian chord)
const HARMONY_GROUPS = {
  major:      { T: [0,2], P: [1,3], D: [4,6] },
  minor:      { T: [0,5], P: [1,3], D: [4,6] },
  dorian:     { T: [0,2], P: [3],   D: [4,6] },
  mixolydian: { T: [0,2], P: [3,5], D: [6,4] },
  pentatonic: null,
  minor_pent: null,
  hirajoshi:  null,
};

const MARKOV = {
  T: { T: 0.15, P: 0.5,  D: 0.35 },
  P: { T: 0.25, P: 0.1,  D: 0.65 },
  D: { T: 0.75, P: 0.05, D: 0.2  },
};

const DURATIONS_LONG  = ['4m', '4m', '2m'];
const DURATIONS_MID   = ['2m', '2m', '1m', '4m'];
const DURATIONS_SHORT = ['1m', '1m', '2n'];

function rollChordOpts(degree) {
  let sus = null;
  const susRoll = Math.random();
  if ((degree === 0 || degree === 3 || degree === 4) && susRoll < 0.30) sus = 'sus2';
  else if ((degree === 4 || degree === 5) && susRoll < 0.20)            sus = 'sus4';
  const extRoll = Math.random();
  const ext = extRoll < 0.60 ? 'add9' : extRoll < 0.90 ? '7th' : null;
  return { sus, ext };
}

// Get the starting index in the full sorted note array for a given scale degree.
// Fixes the oct3-filter bug: for roots like Bb/B/A only 1 note landed in oct3,
// causing all chord voices to collapse to the same pitch.
// Now we work with the full getScaleNotes range (MIDI 48-83) sorted ascending,
// and baseDeg directly indexes the first occurrence of that scale degree.
function startIdxForDegree(all, degree, scaleName) {
  const npo = SCALES[scaleName]?.intervals.length ?? 5; // notes per octave
  const d   = ((degree % npo) + npo) % npo;
  // all[] is sorted ascending; the first npo elements are the lowest available octave.
  // Element d is the d-th scale degree of that lowest octave.
  return Math.min(d, all.length - 1);
}

// Spread voicing: root at lowest available register, upper voices forced above
// root's octave so the chord always opens up — works regardless of root/key.
export function buildChord(root, scaleName, degree, opts = {}) {
  const { sus = null, ext = '7th' } = opts;
  const all = getScaleNotes(root, scaleName);
  const len = all.length;
  if (len === 0) return [];

  const npo      = SCALES[scaleName]?.intervals.length ?? 5;
  const si       = startIdxForDegree(all, degree, scaleName);
  const rootMidi = all[si];
  const rootOct  = Math.floor(rootMidi / 12) - 1;

  // Push a voice up one octave if it sits in the same octave as root,
  // but cap at G5 (79) to prevent very high roots pushing everything into the stratosphere
  function spreadUp(midi) {
    const oct = Math.floor(midi / 12) - 1;
    if (oct === rootOct && midi !== rootMidi) {
      const up = midi + 12;
      return up <= 79 ? up : midi;
    }
    return midi;
  }

  const midStep = sus === 'sus2' ? 1 : sus === 'sus4' ? 3 : 2;
  const fifIdx  = Math.min(si + 4, len - 1);
  // Ensure topIdx is strictly above fifIdx to avoid duplicate voices (affects pentatonic
  // where npo-1 == 4, making 7th and 5th land on the same scale degree)
  let topIdx    = ext === 'add9' ? Math.min(si + npo + 1, len - 1)
                : ext === '7th'  ? Math.min(si + npo - 1, len - 1)
                :                  Math.min(si + npo,     len - 1);
  if (topIdx <= fifIdx) topIdx = Math.min(fifIdx + 1, len - 1);

  const midMidi = spreadUp(all[Math.min(si + midStep, len - 1)]);
  const fifMidi = spreadUp(all[fifIdx]);
  const topMidi = spreadUp(all[topIdx]);

  return [rootMidi, midMidi, fifMidi, topMidi]
    .sort((a, b) => a - b)
    .map(midiToNote);
}

// Rootless pad voicing: 3rd/sus + 7th (+ 9th if add9), no root
// Same spread logic — voices pushed above root's octave
export function buildRootlessVoicing(root, scaleName, degree, opts = {}) {
  const { sus = null, ext = '7th' } = opts;
  const all = getScaleNotes(root, scaleName);
  const len = all.length;
  if (len < 3) return buildChord(root, scaleName, degree, opts);

  const npo      = SCALES[scaleName]?.intervals.length ?? 5;
  const si       = startIdxForDegree(all, degree, scaleName);
  const rootMidi = all[si];
  const rootOct  = Math.floor(rootMidi / 12) - 1;

  function spreadUp(midi) {
    const oct = Math.floor(midi / 12) - 1;
    return (oct === rootOct && midi !== rootMidi) ? Math.min(83, midi + 12) : midi;
  }

  const midStep   = sus === 'sus2' ? 1 : sus === 'sus4' ? 3 : 2;
  const midMidi   = spreadUp(all[Math.min(si + midStep, len - 1)]);
  const sevenMidi = spreadUp(all[Math.min(si + npo - 1, len - 1)]);

  if (ext === 'add9') {
    const ninthMidi = spreadUp(all[Math.min(si + npo + 1, len - 1)]);
    return [midMidi, sevenMidi, ninthMidi].sort((a, b) => a - b).map(midiToNote);
  }
  return [midMidi, sevenMidi].sort((a, b) => a - b).map(midiToNote);
}

// Sub-bass: root of chord dropped one octave below its natural register
export function buildSubBassNote(root, scaleName, degree) {
  const all = getScaleNotes(root, scaleName);
  if (!all.length) return 'C2';
  const si = startIdxForDegree(all, degree, scaleName);
  return midiToNote(all[si] - 12);
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
  const keys  = Object.keys(obj);
  const total = keys.reduce((s, k) => s + obj[k], 0);
  let r = Math.random() * total;
  for (const k of keys) { r -= obj[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function createProgressionGenerator(root, scaleName) {
  const groups  = HARMONY_GROUPS[scaleName] ?? null;
  const isModal = !groups;

  if (isModal) {
    const modalDegrees = {
      pentatonic: [0, 2, 1, 3, 0, 2, 4, 0],
      minor_pent: [0, 2, 3, 1, 0, 3, 1, 0],
      hirajoshi:  [0, 0, 1, 2, 0, 0, 1, 3],
    };
    const seq = modalDegrees[scaleName] ?? modalDegrees.pentatonic;
    let step = 0;
    return function next() {
      const degree = seq[step % seq.length];
      const opts   = rollChordOpts(degree);
      const isLong = (step % seq.length === 0) || (step % seq.length === seq.length - 1);
      const dur    = isLong ? pickFrom(DURATIONS_LONG) : pickFrom(DURATIONS_MID);
      step++;
      return {
        chord:       buildChord(root, scaleName, degree, opts),
        rootlessPad: buildRootlessVoicing(root, scaleName, degree, opts),
        subBassNote: buildSubBassNote(root, scaleName, degree),
        degree, duration: dur, isModal: true,
      };
    };
  }

  const { T, P, D } = groups;
  let currentGroup = 'T';
  let phraseCount  = 0;

  return function next() {
    phraseCount++;
    const isCadenceApproach = (phraseCount % 4 === 3);
    const isCadenceLand     = (phraseCount % 4 === 0);

    let nextGroup;
    if (isCadenceLand)          nextGroup = 'T';
    else if (isCadenceApproach) nextGroup = 'D';
    else                        nextGroup = pickWeightedObj(MARKOV[currentGroup]);

    let degreePool = nextGroup === 'T' ? T
                   : nextGroup === 'P' ? P
                   : D;
    if (currentGroup === 'D' && nextGroup === 'T' && Math.random() < 0.2) degreePool = T;

    const degree   = pickFrom(degreePool);
    currentGroup   = nextGroup;
    const durPool  = nextGroup === 'T' ? (isCadenceLand ? DURATIONS_LONG : DURATIONS_MID)
                   : nextGroup === 'D' ? DURATIONS_SHORT
                   : DURATIONS_MID;
    const duration = pickFrom(durPool);
    const opts     = rollChordOpts(degree);

    return {
      chord:       buildChord(root, scaleName, degree, opts),
      rootlessPad: buildRootlessVoicing(root, scaleName, degree, opts),
      subBassNote: buildSubBassNote(root, scaleName, degree),
      degree, duration, isModal: false,
    };
  };
}
