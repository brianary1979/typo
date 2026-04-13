import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudio } from './hooks/useAudio.js';
import { buildKeyMap } from './lib/keymap.js';
import Controls from './components/Controls.jsx';
import KeyVisualizer from './components/KeyVisualizer.jsx';
import './App.css';

const VALID_KEYS = new Set('abcdefghijklmnopqrstuvwxyz'.split(''));

export default function App() {
  const [root, setRoot]   = useState('C');
  const [scale, setScale] = useState('pentatonic');
  const [activeKeys, setActiveKeys] = useState(new Set());
  const [started, setStarted] = useState(false);
  const [typed, setTyped] = useState('');
  const keyMap = buildKeyMap(root, scale);
  const { start, playNote, stopNote, stopAll } = useAudio(root, scale);
  const heldKeys = useRef(new Set());

  const handleStart = async () => {
    await start();
    setStarted(true);
  };

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

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);

  // Stop all notes when root/scale changes mid-play
  useEffect(() => { stopAll(); }, [root, scale, stopAll]);

  return (
    <div className="app">
      <header>
        <h1>typo</h1>
        <p className="tagline">you can't play a wrong note</p>
      </header>

      <Controls root={root} setRoot={setRoot} scale={scale} setScale={setScale} />

      {!started ? (
        <button className="start-btn" onClick={handleStart}>
          click to begin
        </button>
      ) : (
        <>
          <div className="typed-display">
            {typed || <span className="placeholder">start typing...</span>}
          </div>
          <KeyVisualizer activeKeys={activeKeys} keyMap={keyMap} />
        </>
      )}
    </div>
  );
}
