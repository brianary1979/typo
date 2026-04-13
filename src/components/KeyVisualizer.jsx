const ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m'],
];

export default function KeyVisualizer({ activeKeys, keyMap }) {
  return (
    <div className="keyboard">
      {ROWS.map((row, ri) => (
        <div key={ri} className="key-row">
          {row.map(k => {
            const active = activeKeys.has(k);
            const note = keyMap[k] ?? '';
            return (
              <div key={k} className={`key ${active ? 'active' : ''}`}>
                <span className="key-letter">{k.toUpperCase()}</span>
                {note && <span className="key-note">{note}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
