import { ROOTS, SCALES } from '../lib/scales.js';

export default function Controls({ root, setRoot, scale, setScale }) {
  return (
    <div className="controls">
      <label>
        <span>Key</span>
        <select value={root} onChange={e => setRoot(e.target.value)}>
          {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label>
        <span>Mode</span>
        <select value={scale} onChange={e => setScale(e.target.value)}>
          {Object.entries(SCALES).map(([k, v]) => (
            <option key={k} value={k}>{v.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
