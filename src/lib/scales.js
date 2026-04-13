// Scale definitions as semitone intervals from root
export const SCALES = {
  major:      { name: 'Major',       intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor:      { name: 'Minor',       intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian:     { name: 'Dorian',      intervals: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { name: 'Mixolydian',  intervals: [0, 2, 4, 5, 7, 9, 10] },
  pentatonic: { name: 'Pentatonic',  intervals: [0, 2, 4, 7, 9] },
};

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_MIDI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

// Returns all MIDI note numbers in the scale across octaves 2-6
export function getScaleNotes(root, scaleName) {
  const intervals = SCALES[scaleName]?.intervals ?? SCALES.major.intervals;
  const rootMidi = NOTE_MIDI[root] ?? 0;
  const notes = [];
  for (let octave = 2; octave <= 6; octave++) {
    for (const interval of intervals) {
      const midi = octave * 12 + rootMidi + interval;
      if (midi >= 36 && midi <= 84) notes.push(midi);
    }
  }
  return notes;
}

// Convert MIDI number to Tone.js note string e.g. "C4"
export function midiToNote(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const name = noteNames[midi % 12];
  return `${name}${octave}`;
}

// Diatonic chord roots (scale degrees 0,2,4 etc.) for chord progression
export function getDiatonicChords(root, scaleName) {
  const scaleNotes = getScaleNotes(root, scaleName).filter(m => {
    const oct = Math.floor(m / 12) - 1;
    return oct === 3; // just octave 3 for chord roots
  });
  // triads: root + 3rd + 5th scale degrees
  return scaleNotes.map((rootNote, i) => {
    const third = scaleNotes[i + 2] ?? scaleNotes[i] + 3;
    const fifth = scaleNotes[i + 4] ?? scaleNotes[i] + 7;
    return [rootNote, third, fifth].map(midiToNote);
  });
}
