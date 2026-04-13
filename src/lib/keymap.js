import { getScaleNotes, midiToNote } from './scales.js';

// English letter frequency rank — common letters get stable/central notes
const FREQ_RANK = [
  'e','t','a','o','i','n','s','h','r',     // top tier
  'd','l','c','u','m','w','f','g','y','p',  // mid tier
  'b','v','k','j','x','q','z'              // rare
];

// QWERTY rows map to Tone.js octaves 3 / 4 / 5
// Bottom row → oct 3 (MIDI 48-59), home → oct 4 (60-71), top → oct 5 (72-83)
const TOP_ROW    = new Set(['q','w','e','r','t','y','u','i','o','p']);
const HOME_ROW   = new Set(['a','s','d','f','g','h','j','k','l']);
const BOTTOM_ROW = new Set(['z','x','c','v','b','n','m']);

function getOctaveBand(letter) {
  if (TOP_ROW.has(letter))    return 'high';   // 72-83
  if (HOME_ROW.has(letter))   return 'mid';    // 60-71
  if (BOTTOM_ROW.has(letter)) return 'low';    // 48-59
  return 'mid';
}

export function buildKeyMap(root, scaleName) {
  const all  = getScaleNotes(root, scaleName);
  const low  = all.filter(m => m >= 48 && m <= 59);
  const mid  = all.filter(m => m >= 60 && m <= 71);
  const high = all.filter(m => m >= 72 && m <= 83);

  const map = {};
  for (const letter of FREQ_RANK) {
    const band = getOctaveBand(letter);
    let pool = band === 'high' ? high : band === 'low' ? low : mid;
    if (pool.length === 0) pool = all;

    const rank = FREQ_RANK.indexOf(letter);
    map[letter] = midiToNote(pool[rank % pool.length]);
  }
  return map;
}
