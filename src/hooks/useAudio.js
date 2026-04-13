import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { buildKeyMap } from '../lib/keymap.js';
import { createProgressionGenerator, buildArpPool } from '../lib/chords.js';
import { noteToMidi } from '../lib/scales.js';
import { GenerativeVoice } from '../lib/generator.js';

export function useAudio(root, scaleName) {
  // Synths
  const v1SynthRef    = useRef(null);
  const v2SynthRef    = useRef(null);
  const v3SynthRef    = useRef(null);
  const padRef        = useRef(null);
  const chordRef      = useRef(null);
  const masterGainRef = useRef(null);

  // Voices
  const voicesRef     = useRef([]);

  // Shared generative state — all voices read from these
  const harmonicCtx   = useRef({ arpPool: [], chordMidis: [] });
  const moodRef       = useRef({ density: 0.55, userPitchWeights: {}, userDensityBoost: 0 });

  // Loops
  const chordLoopRef  = useRef(null);
  const metaLoopRef   = useRef(null);
  const v1LoopRef     = useRef(null);
  const v2LoopRef     = useRef(null);
  const v3LoopRef     = useRef(null);

  const progressionRef   = useRef(null);
  const keyMapRef        = useRef({});
  const padNotesRef      = useRef({});
  const startedRef       = useRef(false);
  const startTimeRef     = useRef(0);
  const keypressTimesRef = useRef([]);

  useEffect(() => {
    keyMapRef.current = buildKeyMap(root, scaleName);
  }, [root, scaleName]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    await Tone.start();
    startedRef.current   = true;
    startTimeRef.current = Tone.now();
    keyMapRef.current    = buildKeyMap(root, scaleName);

    // ── Master bus ──────────────────────────────────────────────────────────
    const limiter    = new Tone.Limiter(-2).toDestination();
    const masterGain = new Tone.Gain(1).connect(limiter);
    masterGainRef.current = masterGain;
    const compressor = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 })
      .connect(masterGain);
    const reverb     = new Tone.Reverb({ decay: 7, preDelay: 0.02, wet: 0.5 })
      .connect(compressor);
    const feedDelay  = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.22 })
      .connect(reverb);
    const chorus     = new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0.4, spread: 180, wet: 0.5 })
      .connect(feedDelay);
    chorus.start();
    const lpf        = new Tone.Filter({ frequency: 2000, type: 'lowpass', Q: 0.8 })
      .connect(chorus);

    // Slow LFOs on audio params — coprime periods so they never realign (Eno's trick)
    const brightnessLFO = new Tone.LFO({ frequency: 1/83,  min: 900,  max: 2800, type: 'sine' })
      .connect(lpf.frequency);
    const wetLFO        = new Tone.LFO({ frequency: 1/71,  min: 0.3,  max: 0.65, type: 'sine' })
      .connect(reverb.wet);
    brightnessLFO.start();
    wetLFO.start();

    // ── Synths ──────────────────────────────────────────────────────────────
    // Voice 1 — FM, breathy/vocal, mid register
    v1SynthRef.current = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity:        1.005,
      modulationIndex:    2,
      oscillator:         { type: 'sine' },
      modulation:         { type: 'triangle' },
      envelope:           { attack: 0.25, decay: 0.4,  sustain: 0.7, release: 2.5 },
      modulationEnvelope: { attack: 0.8,  decay: 0.5,  sustain: 0.3, release: 2.0 },
      volume: -11,
    }).connect(lpf);

    // Voice 2 — pure sine, high sparkle layer
    v2SynthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope:   { attack: 0.12, decay: 0.3, sustain: 0.6, release: 3.0 },
      volume: -17,
    }).connect(lpf);

    // Voice 3 — triangle, slow bass foundation
    v3SynthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope:   { attack: 0.5, decay: 0.4, sustain: 0.8, release: 4.0 },
      volume: -14,
    }).connect(lpf);

    // Pad — user held notes, slow attack, just reverb (no FX chain)
    padRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope:   { attack: 1.0, decay: 0.3, sustain: 0.9, release: 6.0 },
      volume: -20,
    }).connect(reverb);

    // Chord bed — very slow sine wash
    chordRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope:   { attack: 0.8, decay: 0.5, sustain: 0.8, release: 5.0 },
      volume: -16,
    }).connect(reverb);

    // ── Generative voices ───────────────────────────────────────────────────
    const v1 = new GenerativeVoice({
      synth: v1SynthRef.current, harmonicCtx, moodRef,
      midiMin: 55, midiMax: 76,   // G3–E5: main melody register
      noteDur: '8n',
    });
    const v2 = new GenerativeVoice({
      synth: v2SynthRef.current, harmonicCtx, moodRef,
      midiMin: 64, midiMax: 83,   // E4–B5: high sparkle
      noteDur: '16n',
    });
    const v3 = new GenerativeVoice({
      synth: v3SynthRef.current, harmonicCtx, moodRef,
      midiMin: 48, midiMax: 67,   // C3–G4: bass foundation
      noteDur: '4n.',
    });
    voicesRef.current = [v1, v2, v3];

    // ── Voice loops at different rates — creates natural polyrhythm ─────────
    // Coprime-ish rates + offset starts means voices drift in/out of phase
    v1LoopRef.current = new Tone.Loop(t => v1.tick(t), '4n').start(0);
    v2LoopRef.current = new Tone.Loop(t => v2.tick(t), '4n.').start('2n');   // half-note offset
    v3LoopRef.current = new Tone.Loop(t => v3.tick(t), '2t').start('1m');    // 1-bar offset

    // ── Chord progression — updates harmonicCtx every 4 bars ───────────────
    progressionRef.current = createProgressionGenerator(root, scaleName);
    const seed = progressionRef.current();
    harmonicCtx.current = { arpPool: buildArpPool(seed), chordMidis: seed.map(noteToMidi) };
    chordRef.current.triggerAttackRelease(seed, '2m', Tone.now() + 0.1);

    chordLoopRef.current = new Tone.Loop((time) => {
      const chord = progressionRef.current?.();
      if (!chord) return;
      harmonicCtx.current = { arpPool: buildArpPool(chord), chordMidis: chord.map(noteToMidi) };
      chordRef.current?.triggerAttackRelease(chord, '2m', time);
    }, '4m');
    chordLoopRef.current.start('4m');

    // ── Meta loop — updates JS-side mood params every 500ms ────────────────
    metaLoopRef.current = new Tone.Loop(() => {
      const elapsed = Tone.now() - startTimeRef.current;

      // Slow density LFO (47s period), swings 0.35–0.75
      const lfoVal  = Math.sin(elapsed / 47 * Math.PI * 2);
      const base    = 0.55 + lfoVal * 0.2;
      const boost   = moodRef.current.userDensityBoost ?? 0;
      moodRef.current.density = Math.min(0.85, base + boost);

      // Decay user pitch weights (~15s half-life)
      const w = moodRef.current.userPitchWeights;
      for (const k in w) {
        w[k] *= 0.97;
        if (w[k] < 0.01) delete w[k];
      }

      // Decay user density boost
      if (boost > 0.01) moodRef.current.userDensityBoost *= 0.95;
    }, 0.5);
    metaLoopRef.current.start(0);

    Tone.getTransport().swing              = 0.15;
    Tone.getTransport().swingSubdivision   = '16n';
    Tone.getTransport().bpm.value          = 76;
    Tone.getTransport().start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // User keypress: soft pad note + bias the generator toward this pitch
  const playNote = useCallback((letter) => {
    const note = keyMapRef.current[letter.toLowerCase()];
    if (!note || padNotesRef.current[letter]) return;
    padNotesRef.current[letter] = note;

    padRef.current?.triggerAttack(note, Tone.now() + 0.01);

    // Boost this pitch class in the probability field
    const pc = note.replace(/\d+$/, '');
    const w  = moodRef.current.userPitchWeights;
    w[pc]    = Math.min(2.0, (w[pc] ?? 0) + 0.6);

    // Typing speed → density boost (more typing = denser generation)
    const now = Date.now();
    keypressTimesRef.current = keypressTimesRef.current.filter(t => now - t < 5000);
    keypressTimesRef.current.push(now);
    const keysPerSec = keypressTimesRef.current.length / 5;
    moodRef.current.userDensityBoost = Math.min(0.3, keysPerSec / 4);
  }, []);

  const stopNote = useCallback((letter) => {
    const note = padNotesRef.current[letter];
    if (!note) return;
    delete padNotesRef.current[letter];
    padRef.current?.triggerRelease(note);
  }, []);

  const stopAll = useCallback(() => {
    // Fade master gain to silence fast so long-release notes don't bleed into the new key
    const g = masterGainRef.current;
    if (g) {
      g.gain.cancelScheduledValues(Tone.now());
      g.gain.rampTo(0, 0.07);
    }
    voicesRef.current.forEach(v => v.reset());
    [v1SynthRef, v2SynthRef, v3SynthRef, padRef, chordRef].forEach(r => r.current?.releaseAll());
    padNotesRef.current              = {};
    moodRef.current.userPitchWeights = {};
    moodRef.current.userDensityBoost = 0;
    // Restore gain after fade completes
    setTimeout(() => g?.gain.rampTo(1, 0.15), 150);
  }, []);

  // Key/scale change: flush state, reseed harmonic context
  useEffect(() => {
    if (!startedRef.current) return;
    stopAll();
    keyMapRef.current  = buildKeyMap(root, scaleName);
    progressionRef.current = createProgressionGenerator(root, scaleName);
    const chord = progressionRef.current();
    harmonicCtx.current = { arpPool: buildArpPool(chord), chordMidis: chord.map(noteToMidi) };
    chordRef.current?.triggerAttackRelease(chord, '2m', Tone.now() + 0.1);
  }, [root, scaleName, stopAll]);

  return { start, playNote, stopNote, stopAll };
}
