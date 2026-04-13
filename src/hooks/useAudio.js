import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { buildKeyMap } from '../lib/keymap.js';
import { getScaleNotes, midiToNote } from '../lib/scales.js';
import { createProgressionGenerator } from '../lib/chords.js';

// Given a note, find the scale note a 5th above it (or nearest scale tone)
function getHarmony(noteName, root, scaleName) {
  const scaleNotes = getScaleNotes(root, scaleName);
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const match = noteName.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;
  const midi = (parseInt(match[2]) + 1) * 12 + noteNames.indexOf(match[1]);
  // Find the scale note closest to a perfect 5th above (7 semitones)
  const target = midi + 7;
  const closest = scaleNotes.reduce((best, n) =>
    Math.abs(n - target) < Math.abs(best - target) ? n : best
  , scaleNotes[0]);
  return midiToNote(closest);
}

export function useAudio(root, scaleName) {
  const leadRef       = useRef(null);
  const padRef        = useRef(null);
  const harmRef       = useRef(null); // harmony voice (5th above)
  const chordSynthRef = useRef(null);
  const bassRef       = useRef(null);
  const reverbRef     = useRef(null);
  const delayRef      = useRef(null);
  const keyMapRef     = useRef({});
  const progressionRef = useRef(null);
  const chordLoopRef  = useRef(null);
  const activeNotes   = useRef(new Set());
  const startedRef    = useRef(false);
  const rootRef       = useRef(root);
  const scaleRef      = useRef(scaleName);

  useEffect(() => {
    rootRef.current  = root;
    scaleRef.current = scaleName;
    keyMapRef.current = buildKeyMap(root, scaleName);
    progressionRef.current = createProgressionGenerator(root, scaleName);
  }, [root, scaleName]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    await Tone.start();
    startedRef.current = true;

    // Effects chain
    reverbRef.current = new Tone.Reverb({ decay: 10, wet: 0.75 }).toDestination();
    delayRef.current  = new Tone.PingPongDelay('8n.', 0.25).connect(reverbRef.current);

    // Lead — bright sine, long release, sits up front
    leadRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.12, decay: 0.2, sustain: 0.85, release: 4.5 },
      volume: -4,
    }).connect(delayRef.current);

    // Harmony — softer sine a 5th above, blends into pad
    harmRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 5.5 },
      volume: -14,
    }).connect(reverbRef.current);

    // Pad — triangle wave, very slow attack/release, washes everything together
    padRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 1.2, decay: 0.5, sustain: 0.9, release: 7.0 },
      volume: -12,
    }).connect(reverbRef.current);

    // Chord layer — deep slow pads, clearly audible underneath
    chordSynthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 2.0, decay: 0.5, sustain: 0.8, release: 6.0 },
      volume: -10,
    }).connect(reverbRef.current);

    // Bass — one octave below chord root, subtle
    bassRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.8, decay: 0.3, sustain: 0.9, release: 5.0 },
      volume: -16,
    }).connect(reverbRef.current);

    // Chord progression — every 2 bars
    chordLoopRef.current = new Tone.Loop((time) => {
      if (!progressionRef.current) return;
      const chord = progressionRef.current();
      chordSynthRef.current?.triggerAttackRelease(chord, '1m', time);
      // Bass plays the root note, two octaves down
      if (chord[0]) {
        const bassNote = chord[0].replace(/\d/, n => Math.max(1, parseInt(n) - 2));
        bassRef.current?.triggerAttackRelease(bassNote, '1m', time);
      }
    }, '2m');

    Tone.getTransport().bpm.value = 70;
    chordLoopRef.current.start(0);
    Tone.getTransport().start();
  }, []);

  const playNote = useCallback((letter) => {
    const note = keyMapRef.current[letter.toLowerCase()];
    if (!note || activeNotes.current.has(letter)) return;
    activeNotes.current.add(letter);
    leadRef.current?.triggerAttack(note);
    padRef.current?.triggerAttack(note);
    // Auto-harmonize with the 5th
    const harmony = getHarmony(note, rootRef.current, scaleRef.current);
    if (harmony) harmRef.current?.triggerAttack(harmony);
  }, []);

  const stopNote = useCallback((letter) => {
    const note = keyMapRef.current[letter.toLowerCase()];
    if (!note) return;
    activeNotes.current.delete(letter);
    leadRef.current?.triggerRelease(note);
    padRef.current?.triggerRelease(note);
    const harmony = getHarmony(note, rootRef.current, scaleRef.current);
    if (harmony) harmRef.current?.triggerRelease(harmony);
  }, []);

  const stopAll = useCallback(() => {
    leadRef.current?.releaseAll();
    padRef.current?.releaseAll();
    harmRef.current?.releaseAll();
    activeNotes.current.clear();
  }, []);

  useEffect(() => {
    progressionRef.current = createProgressionGenerator(root, scaleName);
  }, [root, scaleName]);

  return { start, playNote, stopNote, stopAll };
}
