// Scale definitions as semitone intervals from root
export const SCALES = {
  pentatonic:  { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  minor_pent:  { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  hirajoshi:   { name: 'Hirajoshi',        intervals: [0, 2, 3, 7, 8] },
  dorian:      { name: 'Dorian',           intervals: [0, 2, 3, 5, 7, 9, 10] },
  major:       { name: 'Major',            intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor:       { name: 'Minor',            intervals: [0, 2, 3, 5, 7, 8, 10] },
  mixolydian:  { name: 'Mixolydian',       intervals: [0, 2, 4, 5, 7, 9, 10] },
};

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_MIDI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

// Compressed to Tone.js octaves 3-5 (MIDI 48-83)
// Avoids low-end mud and high-end shriek
export function getScaleNotes(root, scaleName) {
  const intervals = SCALES[scaleName]?.intervals ?? SCALES.pentatonic.intervals;
  const rootMidi  = NOTE_MIDI[root] ?? 0;
  const notes = [];
  // loop var 4→6 maps to Tone.js octaves 3→5 via: toneOct = (loopVal*12 + note) / 12 - 1
  for (let oct = 4; oct <= 6; oct++) {
    for (const interval of intervals) {
      const midi = oct * 12 + rootMidi + interval;
      if (midi >= 48 && midi <= 83) notes.push(midi);
    }
  }
  return [...new Set(notes)].sort((a, b) => a - b);
}

// MIDI ↔ Tone.js note string
export function midiToNote(midi) {
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteNames[midi % 12]}${octave}`;
}

export function noteToMidi(noteName) {
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const match = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!match) return 60;
  return (parseInt(match[2]) + 1) * 12 + noteNames.indexOf(match[1]);
}
