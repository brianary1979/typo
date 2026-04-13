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
  const harmonyRef    = useRef(null); // 4th voice: rootless pad voicings
  const masterGainRef = useRef(null);

  // Voices
  const voicesRef     = useRef([]);

  // Shared generative state — all voices read from these
  const harmonicCtx   = useRef({ arpPool: [], chordMidis: [] });
  const moodRef       = useRef({ density: 0.55, tension: 0, userPitchWeights: {}, userDensityBoost: 0 });

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
  // Track current chord loop interval so it can be rescheduled
  const nextChordTimeRef = useRef(null);

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

    // High-pass before reverb to keep bass dry and clean
    const reverbHpf  = new Tone.Filter({ frequency: 120, type: 'highpass' })
      .connect(reverb);

    // Pitch shimmer: +1 octave, very wet → feeds reverb for Eno/Budd ethereal quality
    const shimmer    = new Tone.PitchShift({ pitch: 12, wet: 0.08 })
      .connect(reverbHpf);

    const feedDelay  = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.22 })
      .connect(shimmer);
    const chorus     = new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0.4, spread: 180, wet: 0.5 })
      .connect(feedDelay);
    chorus.start();
    const lpf        = new Tone.Filter({ frequency: 2000, type: 'lowpass', Q: 0.8 })
      .connect(chorus);

    // Slow LFOs — coprime periods so they never realign (Eno's trick)
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

    // Pad — user held notes, slow attack, direct to reverb
    padRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope:   { attack: 1.0, decay: 0.3, sustain: 0.9, release: 6.0 },
      volume: -20,
    }).connect(reverb);

    // Chord bed — very slow sine wash, direct to reverb
    chordRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope:   { attack: 0.8, decay: 0.5, sustain: 0.8, release: 5.0 },
      volume: -16,
    }).connect(reverb);

    // 4th voice: harmony pad — rootless voicings, slow attack AMSynth warmth
    harmonyRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope:   { attack: 2.5, decay: 0.5, sustain: 0.85, release: 6.0 },
      volume: -19,
    }).connect(reverb);

    // ── Generative voices ───────────────────────────────────────────────────
    const v1 = new GenerativeVoice({
      synth: v1SynthRef.current, harmonicCtx, moodRef,
      midiMin: 55, midiMax: 76,  // G3–E5: main melody register
      durationPool: { '8n': 0.30, '4n': 0.35, '4n.': 0.20, '2n': 0.10, '8t': 0.05 },
      restProb: 0.10,
    });
    const v2 = new GenerativeVoice({
      synth: v2SynthRef.current, harmonicCtx, moodRef,
      midiMin: 64, midiMax: 83,  // E4–B5: high sparkle
      durationPool: { '16n': 0.20, '8n': 0.40, '4n': 0.25, '4n.': 0.15 },
      restProb: 0.15,
    });
    const v3 = new GenerativeVoice({
      synth: v3SynthRef.current, harmonicCtx, moodRef,
      midiMin: 48, midiMax: 67,  // C3–G4: bass foundation
      durationPool: { '4n.': 0.25, '2n': 0.35, '2n.': 0.20, '1n': 0.15, '4n': 0.05 },
      restProb: 0.20,
    });
    voicesRef.current = [v1, v2, v3];

    // ── Voice loops at coprime-ish rates — natural polyrhythm ───────────────
    v1LoopRef.current = new Tone.Loop(t => v1.tick(t), '4n').start(0);
    v2LoopRef.current = new Tone.Loop(t => v2.tick(t), '4n.').start('2n');
    v3LoopRef.current = new Tone.Loop(t => v3.tick(t), '2t').start('1m');

    // ── Chord progression — variable harmonic rhythm ────────────────────────
    progressionRef.current = createProgressionGenerator(root, scaleName);

    function fireChord(time) {
      const result = progressionRef.current?.();
      if (!result) return;
      const { chord, rootlessPad, duration } = result;
      harmonicCtx.current = { arpPool: buildArpPool(chord), chordMidis: chord.map(noteToMidi) };

      // Chord wash
      chordRef.current?.triggerAttackRelease(chord, '2m', time);

      // Rootless harmony pad voicing (3rd + 7th, ± 9th)
      harmonyRef.current?.releaseAll();
      harmonyRef.current?.triggerAttackRelease(rootlessPad, duration, time + 0.05);

      // Schedule next chord after this duration
      const durationSec = Tone.Time(duration).toSeconds();
      nextChordTimeRef.current = time + durationSec;
      Tone.getDraw().schedule(() => {
        fireChord(nextChordTimeRef.current);
      }, nextChordTimeRef.current - 0.1); // schedule 100ms before next chord time
    }

    // Seed initial chord
    const seed = progressionRef.current();
    harmonicCtx.current = { arpPool: buildArpPool(seed.chord), chordMidis: seed.chord.map(noteToMidi) };
    chordRef.current.triggerAttackRelease(seed.chord, '2m', Tone.now() + 0.1);
    harmonyRef.current.triggerAttackRelease(seed.rootlessPad, seed.duration, Tone.now() + 0.15);
    const firstDurSec = Tone.Time(seed.duration).toSeconds();
    nextChordTimeRef.current = Tone.now() + firstDurSec;
    Tone.getDraw().schedule(() => {
      fireChord(nextChordTimeRef.current);
    }, nextChordTimeRef.current - 0.1);

    // ── Meta loop — updates JS-side mood params every 500ms ────────────────
    metaLoopRef.current = new Tone.Loop(() => {
      const elapsed = Tone.now() - startTimeRef.current;

      // Density LFO (47s period), swings 0.35–0.75
      const densityLfo = Math.sin(elapsed / 47 * Math.PI * 2);
      const base       = 0.55 + densityLfo * 0.2;
      const boost      = moodRef.current.userDensityBoost ?? 0;
      moodRef.current.density = Math.min(0.85, base + boost);

      // Tension LFO (97s period, coprime), swings 0–1
      // Peaks align roughly with dominant chords, creating tension/release cycles
      moodRef.current.tension = (Math.sin(elapsed / 97 * Math.PI * 2) + 1) / 2;

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

    Tone.getTransport().swing            = 0.15;
    Tone.getTransport().swingSubdivision = '16n';
    Tone.getTransport().bpm.value        = 76;
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

    // Typing speed → density boost
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
    const g = masterGainRef.current;
    if (g) {
      g.gain.cancelScheduledValues(Tone.now());
      g.gain.rampTo(0, 0.07);
    }
    voicesRef.current.forEach(v => v.reset());

    // Temporarily collapse all release envelopes so lookahead-scheduled notes
    // die instantly instead of hanging audibly through the gain restore
    const synths = [
      { ref: v1SynthRef, release: 2.5, modRelease: 2.0 },
      { ref: v2SynthRef, release: 3.0 },
      { ref: v3SynthRef, release: 4.0 },
      { ref: padRef,     release: 6.0 },
      { ref: chordRef,   release: 5.0 },
      { ref: harmonyRef, release: 6.0 },
    ];
    synths.forEach(({ ref }) => {
      const s = ref.current;
      if (!s) return;
      s.set({ envelope: { release: 0.05 } });
      if (s.get().modulationEnvelope !== undefined) s.set({ modulationEnvelope: { release: 0.05 } });
    });

    [v1SynthRef, v2SynthRef, v3SynthRef, padRef, chordRef, harmonyRef]
      .forEach(r => r.current?.releaseAll());

    padNotesRef.current              = {};
    moodRef.current.userPitchWeights = {};
    moodRef.current.userDensityBoost = 0;

    setTimeout(() => {
      synths.forEach(({ ref, release, modRelease }) => {
        const s = ref.current;
        if (!s) return;
        s.set({ envelope: { release } });
        if (modRelease !== undefined) s.set({ modulationEnvelope: { release: modRelease } });
      });
      g?.gain.rampTo(1, 0.15);
    }, 200);
  }, []);

  // Key/scale change: flush state, reseed harmonic context
  useEffect(() => {
    if (!startedRef.current) return;
    stopAll();
    keyMapRef.current      = buildKeyMap(root, scaleName);
    progressionRef.current = createProgressionGenerator(root, scaleName);
    const result = progressionRef.current();
    harmonicCtx.current = { arpPool: buildArpPool(result.chord), chordMidis: result.chord.map(noteToMidi) };
    setTimeout(() => {
      chordRef.current?.triggerAttackRelease(result.chord, '2m', Tone.now() + 0.1);
      harmonyRef.current?.triggerAttackRelease(result.rootlessPad, result.duration, Tone.now() + 0.15);
    }, 250);
  }, [root, scaleName, stopAll]);

  return { start, playNote, stopNote, stopAll };
}
