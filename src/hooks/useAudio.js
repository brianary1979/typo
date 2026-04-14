import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { buildKeyMap } from '../lib/keymap.js';
import { createProgressionGenerator, buildArpPool } from '../lib/chords.js';
import { noteToMidi } from '../lib/scales.js';
import { GenerativeVoice } from '../lib/generator.js';
import { PRESETS } from '../lib/presets.js';

export function useAudio(root, scaleName, presetName) {
  // Synths
  const v1SynthRef    = useRef(null);
  const v2SynthRef    = useRef(null);
  const v3SynthRef    = useRef(null);
  const padRef        = useRef(null);
  const chordRef      = useRef(null);
  const harmonyRef    = useRef(null);
  const subBassRef    = useRef(null); // MonoSynth — root in oct2
  const masterGainRef = useRef(null);

  // Voices
  const voicesRef     = useRef([]);

  // Shared generative state
  const harmonicCtx   = useRef({ arpPool: [], chordMidis: [] });
  const moodRef       = useRef({ density: 0.55, tension: 0, userPitchWeights: {}, userDensityBoost: 0 });

  // Loops
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
  const nextChordTimeRef = useRef(null);
  const releaseTimesRef  = useRef(null);

  useEffect(() => {
    keyMapRef.current = buildKeyMap(root, scaleName);
  }, [root, scaleName]);

  const applyPreset = useCallback((name) => {
    const p = PRESETS[name] ?? PRESETS.ethereal;
    v1SynthRef.current?.set(p.v1);
    v2SynthRef.current?.set(p.v2);
    v3SynthRef.current?.set(p.v3);
    padRef.current?.set(p.pad);
    chordRef.current?.set(p.chord);
    harmonyRef.current?.set(p.harmony);
    if (subBassRef.current && p.subBass) subBassRef.current.set(p.subBass);
    releaseTimesRef.current = {
      v1: p.v1.envelope.release, v1mod: p.v1.modulationEnvelope?.release,
      v2: p.v2.envelope.release,
      v3: p.v3.envelope.release,
      pad:     p.pad.envelope.release,
      chord:   p.chord.envelope.release,
      harmony: p.harmony.envelope.release,
      subBass: p.subBass?.envelope.release ?? 5.0,
    };
  }, []);

  useEffect(() => {
    if (!startedRef.current) return;
    applyPreset(presetName);
  }, [presetName, applyPreset]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    await Tone.start();
    startedRef.current   = true;
    startTimeRef.current = Tone.now();
    keyMapRef.current    = buildKeyMap(root, scaleName);

    const preset = PRESETS[presetName] ?? PRESETS.ethereal;

    // ── Master bus ──────────────────────────────────────────────────────────
    const limiter    = new Tone.Limiter(-2).toDestination();
    const masterGain = new Tone.Gain(1).connect(limiter);
    masterGainRef.current = masterGain;
    const compressor = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 })
      .connect(masterGain);
    const reverb     = new Tone.Reverb({ decay: 7, preDelay: 0.02, wet: 0.5 })
      .connect(compressor);
    const reverbHpf  = new Tone.Filter({ frequency: 120, type: 'highpass' })
      .connect(reverb);
    const shimmer    = new Tone.PitchShift({ pitch: 12, wet: 0.08 })
      .connect(reverbHpf);
    const feedDelay  = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.22 })
      .connect(shimmer);
    const chorus     = new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0.4, spread: 180, wet: 0.5 })
      .connect(feedDelay);
    chorus.start();
    const lpf        = new Tone.Filter({ frequency: 2000, type: 'lowpass', Q: 0.8 })
      .connect(chorus);

    const brightnessLFO = new Tone.LFO({ frequency: 1/83, min: 900,  max: 2800, type: 'sine' }).connect(lpf.frequency);
    const wetLFO        = new Tone.LFO({ frequency: 1/71, min: 0.3,  max: 0.65, type: 'sine' }).connect(reverb.wet);
    brightnessLFO.start();
    wetLFO.start();

    // ── Synths ──────────────────────────────────────────────────────────────
    v1SynthRef.current = new Tone.PolySynth(Tone.FMSynth, preset.v1).connect(lpf);
    v2SynthRef.current = new Tone.PolySynth(Tone.Synth,   preset.v2).connect(lpf);
    v3SynthRef.current = new Tone.PolySynth(Tone.Synth,   preset.v3).connect(lpf);
    padRef.current     = new Tone.PolySynth(Tone.Synth,   preset.pad).connect(reverb);
    chordRef.current   = new Tone.PolySynth(Tone.Synth,   preset.chord).connect(reverb);
    harmonyRef.current = new Tone.PolySynth(Tone.Synth,   preset.harmony).connect(reverb);

    // Sub-bass: MonoSynth, root in oct2, HPF at 55Hz before reverb to prevent extreme rumble
    const subBassHpf = new Tone.Filter({ frequency: 55, type: 'highpass' }).connect(reverb);
    subBassRef.current = new Tone.MonoSynth({
      ...preset.subBass,
      portamento: 0,
    }).connect(subBassHpf);

    releaseTimesRef.current = {
      v1: preset.v1.envelope.release, v1mod: preset.v1.modulationEnvelope?.release,
      v2: preset.v2.envelope.release,
      v3: preset.v3.envelope.release,
      pad:     preset.pad.envelope.release,
      chord:   preset.chord.envelope.release,
      harmony: preset.harmony.envelope.release,
      subBass: preset.subBass?.envelope.release ?? 5.0,
    };

    // ── Generative voices ───────────────────────────────────────────────────
    const v1 = new GenerativeVoice({
      synth: v1SynthRef.current, harmonicCtx, moodRef,
      midiMin: 55, midiMax: 76,
      durationPool: { '8n': 0.30, '4n': 0.35, '4n.': 0.20, '2n': 0.10, '8t': 0.05 },
      restProb: 0.10,
    });
    const v2 = new GenerativeVoice({
      synth: v2SynthRef.current, harmonicCtx, moodRef,
      midiMin: 64, midiMax: 83,
      durationPool: { '16n': 0.20, '8n': 0.40, '4n': 0.25, '4n.': 0.15 },
      restProb: 0.15,
    });
    const v3 = new GenerativeVoice({
      synth: v3SynthRef.current, harmonicCtx, moodRef,
      midiMin: 48, midiMax: 67,
      durationPool: { '4n.': 0.25, '2n': 0.35, '2n.': 0.20, '1n': 0.15, '4n': 0.05 },
      restProb: 0.20,
    });
    voicesRef.current = [v1, v2, v3];

    v1LoopRef.current = new Tone.Loop(t => v1.tick(t), '4n').start(0);
    v2LoopRef.current = new Tone.Loop(t => v2.tick(t), '4n.').start('2n');
    v3LoopRef.current = new Tone.Loop(t => v3.tick(t), '2t').start('1m');

    // ── Chord progression — variable harmonic rhythm ────────────────────────
    progressionRef.current = createProgressionGenerator(root, scaleName);

    function fireChord(time) {
      const result = progressionRef.current?.();
      if (!result) return;
      const { chord, rootlessPad, subBassNote, duration } = result;
      harmonicCtx.current = { arpPool: buildArpPool(chord), chordMidis: chord.map(noteToMidi) };

      chordRef.current?.triggerAttackRelease(chord, '2m', time);
      harmonyRef.current?.releaseAll();
      harmonyRef.current?.triggerAttackRelease(rootlessPad, duration, time + 0.05);

      // Sub-bass: trigger attack (MonoSynth auto-releases previous note)
      subBassRef.current?.triggerAttack(subBassNote, time + 0.1);

      const durationSec = Tone.Time(duration).toSeconds();
      nextChordTimeRef.current = time + durationSec;
      Tone.getDraw().schedule(() => {
        fireChord(nextChordTimeRef.current);
      }, nextChordTimeRef.current - 0.1);
    }

    // Seed first chord
    const seed = progressionRef.current();
    harmonicCtx.current = { arpPool: buildArpPool(seed.chord), chordMidis: seed.chord.map(noteToMidi) };
    chordRef.current.triggerAttackRelease(seed.chord, '2m', Tone.now() + 0.1);
    harmonyRef.current.triggerAttackRelease(seed.rootlessPad, seed.duration, Tone.now() + 0.15);
    subBassRef.current.triggerAttack(seed.subBassNote, Tone.now() + 0.2);
    const firstDurSec = Tone.Time(seed.duration).toSeconds();
    nextChordTimeRef.current = Tone.now() + firstDurSec;
    Tone.getDraw().schedule(() => {
      fireChord(nextChordTimeRef.current);
    }, nextChordTimeRef.current - 0.1);

    // ── Meta loop ───────────────────────────────────────────────────────────
    metaLoopRef.current = new Tone.Loop(() => {
      const elapsed    = Tone.now() - startTimeRef.current;
      const densityLfo = Math.sin(elapsed / 47 * Math.PI * 2);
      const base       = 0.55 + densityLfo * 0.2;
      const boost      = moodRef.current.userDensityBoost ?? 0;
      moodRef.current.density = Math.min(0.85, base + boost);
      moodRef.current.tension = (Math.sin(elapsed / 97 * Math.PI * 2) + 1) / 2;
      const w = moodRef.current.userPitchWeights;
      for (const k in w) { w[k] *= 0.97; if (w[k] < 0.01) delete w[k]; }
      if (boost > 0.01) moodRef.current.userDensityBoost *= 0.95;
    }, 0.5);
    metaLoopRef.current.start(0);

    Tone.getTransport().swing            = 0.15;
    Tone.getTransport().swingSubdivision = '16n';
    Tone.getTransport().bpm.value        = 76;
    Tone.getTransport().start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const playNote = useCallback((letter) => {
    const note = keyMapRef.current[letter.toLowerCase()];
    if (!note || padNotesRef.current[letter]) return;
    padNotesRef.current[letter] = note;
    padRef.current?.triggerAttack(note, Tone.now() + 0.01);
    const pc = note.replace(/\d+$/, '');
    const w  = moodRef.current.userPitchWeights;
    w[pc]    = Math.min(2.0, (w[pc] ?? 0) + 0.6);
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

    const rt = releaseTimesRef.current ?? {
      v1: 2.5, v1mod: 2.0, v2: 3.0, v3: 4.0, pad: 6.0, chord: 5.0, harmony: 6.0, subBass: 5.0,
    };

    const polySynths = [
      { ref: v1SynthRef,  release: rt.v1,     modRelease: rt.v1mod },
      { ref: v2SynthRef,  release: rt.v2 },
      { ref: v3SynthRef,  release: rt.v3 },
      { ref: padRef,      release: rt.pad },
      { ref: chordRef,    release: rt.chord },
      { ref: harmonyRef,  release: rt.harmony },
    ];
    polySynths.forEach(({ ref }) => {
      const s = ref.current;
      if (!s) return;
      s.set({ envelope: { release: 0.05 } });
      if (s.get().modulationEnvelope !== undefined) s.set({ modulationEnvelope: { release: 0.05 } });
    });
    polySynths.forEach(({ ref }) => ref.current?.releaseAll());

    // MonoSynth sub-bass: collapse release and trigger release
    subBassRef.current?.set({ envelope: { release: 0.05 } });
    subBassRef.current?.triggerRelease();

    padNotesRef.current              = {};
    moodRef.current.userPitchWeights = {};
    moodRef.current.userDensityBoost = 0;

    setTimeout(() => {
      polySynths.forEach(({ ref, release, modRelease }) => {
        const s = ref.current;
        if (!s) return;
        s.set({ envelope: { release } });
        if (modRelease !== undefined) s.set({ modulationEnvelope: { release: modRelease } });
      });
      subBassRef.current?.set({ envelope: { release: rt.subBass } });
      g?.gain.rampTo(1, 0.15);
    }, 200);
  }, []);

  // Key/scale change: flush and reseed
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
      subBassRef.current?.triggerAttack(result.subBassNote, Tone.now() + 0.2);
    }, 250);
  }, [root, scaleName, stopAll]);

  return { start, playNote, stopNote, stopAll };
}
