import { getScaleNotes, midiToNote } from './scales.js';

// Functional harmony groups per scale
// Dorian: P group = only degree 3 (IV major — THE characteristic Dorian chord)
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

// Roll chord colour per chord — decided once in the progression, passed to builders
function rollChordOpts(degree) {
  let sus = null;
  const susRoll = Math.random();
  // sus2: good on stable degrees (I/IV/V ≈ 0,3,4) — floating, ambiguous
  // sus4: good on dominant (V/vi ≈ 4,5) — tension without leading-tone
  if ((degree === 0 || degree === 3 || degree === 4) && susRoll < 0.30) sus = 'sus2';
  else if ((degree === 4 || degree === 5) && susRoll < 0.20)             sus = 'sus4';

  // add9: static/shimmery (60%) — ideal for ambient, avoids directional 7th pull
  // 7th: directional (30%) — some harmonic tension
  // plain triad (10%) — clarity
  const extRoll = Math.random();
  const ext = extRoll < 0.60 ? 'add9' : extRoll < 0.90 ? '7th' : null;

  return { sus, ext };
}

// Spread voicing: root anchors oct3, upper voices open up to oct4-5
// Root alone in bass position, then wide gap to the upper cluster — avoids mud
export function buildChord(root, scaleName, degree, opts = {}) {
  const { sus = null, ext = '7th' } = opts;
  const all  = getScaleNotes(root, scaleName);
  const oct3 = all.filter(m => Math.floor(m / 12) - 1 === 3);
  const len  = oct3.length;
  if (len === 0) return [];
  const d = ((degree % len) + len) % len;

  const rootMidi = oct3[d]; // root in oct3

  // Mid voice: sus2 (2nd), sus4 (4th), or normal 3rd — bumped to oct4
  const midDeg = sus === 'sus2' ? (d + 1) % len
               : sus === 'sus4' ? (d + 3) % len
               :                   (d + 2) % len;
  const midMidi   = Math.min(83, oct3[midDeg] + 12);        // oct4
  const fifthMidi = Math.min(83, oct3[(d + 4) % len] + 12); // 5th in oct4

  // Top voice: add9 in oct5, 7th in oct4, or doubled 5th
  const topMidi = ext === 'add9'
    ? Math.min(83, oct3[(d + 1) % len] + 24)  // 9th = 2nd + 2 octaves (oct5)
    : ext === '7th'
    ? Math.min(83, oct3[(d + 6) % len] + 12)  // 7th in oct4
    : Math.min(83, oct3[(d + 4) % len] + 12); // plain: doubled 5th

  return [rootMidi, midMidi, fifthMidi, topMidi].map(midiToNote);
}

// Rootless voicing for harmony pad: 3rd/sus in oct4, 7th in oct4, 9th in oct5
// No root — sub-bass owns that register
export function buildRootlessVoicing(root, scaleName, degree, opts = {}) {
  const { sus = null, ext = '7th' } = opts;
  const all  = getScaleNotes(root, scaleName);
  const oct3 = all.filter(m => Math.floor(m / 12) - 1 === 3);
  const len  = oct3.length;
  if (len < 3) return buildChord(root, scaleName, degree, opts);
  const d = ((degree % len) + len) % len;

  const midDeg    = sus === 'sus2' ? (d + 1) % len
                  : sus === 'sus4' ? (d + 3) % len
                  :                   (d + 2) % len;
  const midMidi   = Math.min(83, oct3[midDeg] + 12);
  const sevenMidi = Math.min(83, oct3[(d + 6) % len] + 12);

  if (ext === 'add9') {
    const ninthMidi = Math.min(83, oct3[(d + 1) % len] + 24);
    return [midMidi, sevenMidi, ninthMidi].map(midiToNote);
  }
  return [midMidi, sevenMidi].map(midiToNote);
}

// Sub-bass: root dropped one octave below oct3 → oct2 (C2–B2, ~65–123 Hz)
function buildSubBassNote(root, scaleName, degree) {
  const all  = getScaleNotes(root, scaleName);
  const oct3 = all.filter(m => Math.floor(m / 12) - 1 === 3);
  if (!oct3.length) return 'C2';
  const len = oct3.length;
  const d = ((degree % len) + len) % len;
  return midiToNote(oct3[d] - 12);
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
    if (currentGroup === 'D' && nextGroup === 'T' && Math.random() < 0.2) {
      degreePool = T; // deceptive cadence
    }

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
