import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudio } from './hooks/useAudio.js';
import { buildKeyMap } from './lib/keymap.js';
import Controls from './components/Controls.jsx';
import KeyVisualizer from './components/KeyVisualizer.jsx';
import './App.css';

const VALID_KEYS = new Set('abcdefghijklmnopqrstuvwxyz'.split(''));

export default function App() {
  const [root, setRoot]     = useState('D#');
  const [scale, setScale]   = useState('dorian');
  const [preset, setPreset] = useState('strings');
  const [activeKeys, setActiveKeys] = useState(new Set());
  const [started, setStarted] = useState(false);
  const [typed, setTyped]   = useState('');
  const keyMap = buildKeyMap(root, scale);
  const { start, playNote, stopNote, stopAll } = useAudio(root, scale, preset);
  const heldKeys = useRef(new Set());

  const handleStart = useCallback(async () => {
    await start();
    setStarted(true);
  }, [start]);

  const onKeyDown = useCallback((e) => {
    if (!started || e.repeat) return;
    const key = e.key.toLowerCase();
    if (!VALID_KEYS.has(key)) return;
    if (heldKeys.current.has(key)) return;
    heldKeys.current.add(key);
    playNote(key);
    setActiveKeys(prev => new Set([...prev, key]));
    setTyped(prev => (prev + key).slice(-40));
  }, [started, playNote]);

  const onKeyUp = useCallback((e) => {
    const key = e.key.toLowerCase();
    if (!VALID_KEYS.has(key)) return;
    heldKeys.current.delete(key);
    stopNote(key);
    setActiveKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [stopNote]);

  // Orb pointer handlers — work for both mouse clicks and touch on mobile.
  // First orb tap also triggers start() so mobile users don't need the button.
  const onOrbDown = useCallback(async (key) => {
    if (!started) await handleStart();
    if (heldKeys.current.has(key)) return;
    heldKeys.current.add(key);
    playNote(key);
    setActiveKeys(prev => new Set([...prev, key]));
    setTyped(prev => (prev + key).slice(-40));
  }, [started, handleStart, playNote]);

  const onOrbUp = useCallback((key) => {
    if (!heldKeys.current.has(key)) return;
    heldKeys.current.delete(key);
    stopNote(key);
    setActiveKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [stopNote]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);

  useEffect(() => { stopAll(); }, [root, scale, stopAll]);

  return (
    <div className="app">
      <header>
        <h1>typo</h1>
        <p className="tagline">music from the universe</p>
      </header>

      <Controls
        root={root} setRoot={setRoot}
        scale={scale} setScale={setScale}
        preset={preset} setPreset={setPreset}
      />

      {!started ? (
        <button className="start-btn" onClick={handleStart}>
          tap to begin
        </button>
      ) : (
        <div className="typed-display">
          {typed || <span className="placeholder">tap the keys...</span>}
        </div>
      )}

      <KeyVisualizer
        activeKeys={activeKeys}
        keyMap={keyMap}
        onOrbDown={onOrbDown}
        onOrbUp={onOrbUp}
      />

      <a className="home-link" href="https://bflabby.org">bflabby.org</a>

      <ul className="instructions">
        <li>hold 2–3 keys at once and hear how they blend</li>
        <li>do nothing — let the algorithm play by itself</li>
        <li>try different keys and modes for a totally different feel</li>
        <li>type anything and every word becomes music</li>
      </ul>
    </div>
  );
}
