import { getScaleNotes, midiToNote } from './scales.js';

// 4-chord phrase arc per scale family — provides tension/resolution shape
// Indices are scale degree offsets into the scale note array
const PHRASE_DEGREES = {
  pentatonic:  [0, 2, 1, 3],   // I → iii → ii → IV  (open, floaty)
  minor_pent:  [0, 2, 3, 1],   // i → III → IV → ii
  hirajoshi:   [0, 1, 2, 0],   // I → II → III → I   (circular, cinematic)
  major:       [0, 3, 1, 4],   // I → IV → ii → V    (classic I-IV-ii-V)
  minor:       [0, 5, 3, 6],   // i → bVI → bIII → bVII
  dorian:      [0, 1, 3, 4],   // i → ii → IV → V
  mixolydian:  [0, 6, 3, 4],   // I → bVII → IV → V
};

// Build a 4-note chord (triad + 7th) at the given scale degree
export function buildChord(root, scaleName, degree) {
  const all  = getScaleNotes(root, scaleName);
  // Use Tone.js octave 3 (MIDI 48-59) as chord base
  const oct3 = all.filter(m => Math.floor(m / 12) - 1 === 3);
  const len  = oct3.length;
  if (len === 0) return [];

  const d = degree % len;
  // Root, diatonic 3rd, 5th, 7th — always in-scale, always consonant
  return [
    oct3[d % len],
    oct3[(d + 2) % len],
    oct3[(d + 4) % len],
    oct3[(d + 6) % len],
  ].map(midiToNote);
}

// Extend a chord's note names across Tone.js octaves 3-5 for arpeggiating
export function buildArpPool(chordNotes) {
  const names = chordNotes.map(n => n.replace(/\d+$/, ''));
  const pool  = [];
  for (let oct = 3; oct <= 5; oct++) {
    names.forEach(name => pool.push(name + oct));
  }
  return pool;
}

// Arpeggio pattern shapes — indices into an arp pool
// Patterns designed to work well at any pool length via modulo
export const ARP_PATTERNS = [
  [0,1,2,3,4,5,6,7,8,9,10,11],          // pure up
  [0,1,2,3,4,5,4,3,2,1],                // up-down
  [0,2,1,3,2,4,3,5,4,6,5,7],            // broken thirds (Alberti-ish)
  [0,4,1,5,2,6,3,7,4,8,5,9],            // octave jumps
  [0,3,0,4,0,5,0,6,0,7,0,8],            // pedal root
  [0,1,3,2,4,3,5,4,6,5,7,6],            // spiral
];

export function createProgressionGenerator(root, scaleName) {
  const degrees = PHRASE_DEGREES[scaleName] ?? PHRASE_DEGREES.pentatonic;
  let step = 0;
  return function next() {
    const degree = degrees[step % degrees.length];
    step++;
    return buildChord(root, scaleName, degree);
  };
}
