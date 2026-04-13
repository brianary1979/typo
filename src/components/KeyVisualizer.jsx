const ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m'],
];

let globalIndex = 0;
const ORB_INDEX = {};
ROWS.forEach(row => row.forEach(k => { ORB_INDEX[k] = globalIndex++; }));

export default function KeyVisualizer({ activeKeys, keyMap, onOrbDown, onOrbUp }) {
  return (
    <div className="orb-field">
      {ROWS.map((row, ri) => (
        <div key={ri} className="orb-row">
          {row.map(k => {
            const active = activeKeys.has(k);
            const note = keyMap[k] ?? '';
            return (
              <div
                key={k}
                className={`orb ${active ? 'active' : ''}`}
                style={{ '--orb-index': ORB_INDEX[k] }}
                title={note}
                onPointerDown={e => { e.preventDefault(); onOrbDown?.(k); }}
                onPointerUp={e => { e.preventDefault(); onOrbUp?.(k); }}
                onPointerLeave={e => { if (e.buttons > 0 || e.pointerType === 'touch') onOrbUp?.(k); }}
                onPointerCancel={() => onOrbUp?.(k)}
              >
                <span className="orb-letter">{k.toUpperCase()}</span>
                {note && <span className="orb-note">{note}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
