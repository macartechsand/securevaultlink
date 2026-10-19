import { useState } from 'react';
import { passwordStrength } from '../lib/health/passwordHealth';
import { STRENGTH_LABELS, strengthBadge } from '../lib/labels';
import { generatePassword } from '../lib/passwordGenerator';
import { Icon } from './ui/Icon';

type Options = { length: number; uppercase: boolean; numbers: boolean; symbols: boolean };

export function Generator() {
  const [options, setOptions] = useState<Options>({ length: 20, uppercase: true, numbers: true, symbols: true });
  const [password, setPassword] = useState(() => generatePassword(options));
  const [copied, setCopied] = useState(false);

  const update = (next: Partial<Options>) => {
    const merged = { ...options, ...next };
    setOptions(merged);
    setPassword(generatePassword(merged));
    setCopied(false);
  };

  const strength = passwordStrength(password);

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Gerador</p>
          <h2>Gerador de senhas</h2>
          <p className="subtle">Gerado no seu navegador com um gerador criptográfico. Nada é enviado ao servidor.</p>
        </div>
        <span className={`badge ${strengthBadge(strength)}`}>{STRENGTH_LABELS[strength]}</span>
      </div>

      <div className="secret-box">
        <code>{password}</code>
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copiada' : 'Copiar'}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => update({})}>
          <Icon name="refresh" size={16} />
          Nova
        </button>
      </div>

      <label className="field">
        <span className="row-between">
          <span>Tamanho</span>
          <strong>{options.length} caracteres</strong>
        </span>
        <input type="range" min="12" max="64" value={options.length} onChange={(e) => update({ length: Number(e.target.value) })} />
      </label>

      <div className="row">
        <label className="check">
          <input type="checkbox" checked={options.uppercase} onChange={() => update({ uppercase: !options.uppercase })} />
          Letras maiúsculas
        </label>
        <label className="check">
          <input type="checkbox" checked={options.numbers} onChange={() => update({ numbers: !options.numbers })} />
          Números
        </label>
        <label className="check">
          <input type="checkbox" checked={options.symbols} onChange={() => update({ symbols: !options.symbols })} />
          Símbolos
        </label>
      </div>
    </section>
  );
}
