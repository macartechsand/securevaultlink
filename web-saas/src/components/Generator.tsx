import { useState } from 'react';
import { passwordStrength } from '../lib/health/passwordHealth';
import { generatePassword } from '../lib/passwordGenerator';

export function Generator() {
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState(() => generatePassword({ length: 20, uppercase: true, numbers: true, symbols: true }));
  const [copied, setCopied] = useState(false);

  const regenerate = (next: Partial<{ length: number; uppercase: boolean; numbers: boolean; symbols: boolean }> = {}) => {
    const options = { length, uppercase, numbers, symbols, ...next };
    setPassword(generatePassword(options));
    setCopied(false);
  };

  const strength = passwordStrength(password);

  return (
    <div className="panel generator-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Generator</p>
          <h3>Password builder</h3>
        </div>
        <span className={`strength ${strength.toLowerCase()}`}>{strength}</span>
      </div>

      <div className="password-output">
        <span>{password}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={() => regenerate()}>
          New
        </button>
      </div>

      <label className="range-row">
        <span>Length</span>
        <strong>{length}</strong>
      </label>
      <input
        type="range"
        min="12"
        max="64"
        value={length}
        onChange={(e) => {
          setLength(Number(e.target.value));
          regenerate({ length: Number(e.target.value) });
        }}
      />

      <div className="toggle-list">
        <label>
          <input type="checkbox" checked={uppercase} onChange={() => { setUppercase(!uppercase); regenerate({ uppercase: !uppercase }); }} />
          Uppercase
        </label>
        <label>
          <input type="checkbox" checked={numbers} onChange={() => { setNumbers(!numbers); regenerate({ numbers: !numbers }); }} />
          Numbers
        </label>
        <label>
          <input type="checkbox" checked={symbols} onChange={() => { setSymbols(!symbols); regenerate({ symbols: !symbols }); }} />
          Symbols
        </label>
      </div>
    </div>
  );
}
