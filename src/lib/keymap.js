import { getScaleNotes, midiToNote } from './scales.js';

// English letter frequency rank (most → least common)
// Used to assign stable chord tones to common letters
const FREQ_RANK = [
  'e','t','a','o','i','n','s','h','r', // top tier  → stable tones (root, 3rd, 5th)
  'd','l','c','u','m','w','f','g','y','p', // mid tier → color tones (2nd, 6th, 7th)
  'b','v','k','j','x','q','z'             // rare      → tension / high octave
];

// QWERTY row → octave offset
const ROW_OCTAVE = {
  top:    1,  // Q W E R T Y U I O P  → higher
  home:   0,  // A S D F G H J K L    → middle
  bottom: -1, // Z X C V B N M        → lower
};

const TOP_ROW    = new Set(['q','w','e','r','t','y','u','i','o','p']);
const HOME_ROW   = new Set(['a','s','d','f','g','h','j','k','l']);
const BOTTOM_ROW = new Set(['z','x','c','v','b','n','m']);

function getRowOctaveOffset(letter) {
  if (TOP_ROW.has(letter))    return ROW_OCTAVE.top;
  if (HOME_ROW.has(letter))   return ROW_OCTAVE.home;
  if (BOTTOM_ROW.has(letter)) return ROW_OCTAVE.bottom;
  return 0;
}

// Build letter → note mapping for a given key + scale
export function buildKeyMap(root, scaleName) {
  const allNotes = getScaleNotes(root, scaleName);

  // Split notes into three octave bands centered around middle
  const low    = allNotes.filter(m => m < 48);
  const mid    = allNotes.filter(m => m >= 48 && m < 60);
  const high   = allNotes.filter(m => m >= 60);

  const map = {};

  for (const letter of FREQ_RANK) {
    const octOffset = getRowOctaveOffset(letter);
    let pool = octOffset > 0 ? high : octOffset < 0 ? low : mid;
    if (pool.length === 0) pool = allNotes; // fallback

    // Pick note based on position within frequency rank
    const rank = FREQ_RANK.indexOf(letter);
    const note = pool[rank % pool.length];
    map[letter] = midiToNote(note);
  }

  return map;
}
