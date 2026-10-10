import { type FormEvent, useState } from 'react';
import type { VaultItemData } from '../lib/crypto';
import { analyzeUrl } from '../lib/urlCheck';
import { passwordStrength } from '../lib/health/passwordHealth';
import { generatePassword } from '../lib/passwordGenerator';
import { checkUrlReputation, type UrlReputation } from '../services/urlReputation';

export const CATEGORIES = ['Work', 'Finance', 'Social', 'Personal', 'Other'];

type EntryFormProps = {
  initial?: VaultItemData;
  onSubmit: (data: VaultItemData) => Promise<void>;
  onCancel: () => void;
};

const empty: VaultItemData = { title: '', username: '', password: '', url: '', notes: '', category: 'Personal' };

export function EntryForm({ initial, onSubmit, onCancel }: EntryFormProps) {
  const [data, setData] = useState<VaultItemData>(initial ?? empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [reputation, setReputation] = useState<UrlReputation | null>(null);
  const [checkingUrl, setCheckingUrl] = useState(false);

  const set = (key: keyof VaultItemData) => (e: { target: { value: string } }) =>
    setData((prev) => ({ ...prev, [key]: e.target.value }));

  const urlReport = data.url.trim() ? analyzeUrl(data.url) : null;
  const strength = data.password ? passwordStrength(data.password, [data.title, data.username]) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (data.url.trim() && !urlReport?.valid) {
      setError('Enter a valid http(s) address, or leave the site empty.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ ...data, title: data.title.trim(), url: data.url.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{initial ? 'Edit' : 'New'} credential</p>
            <h3>{initial ? 'Edit entry' : 'Add an entry'}</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onCancel}>
            Close
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Title
            <input value={data.title} onChange={set('title')} required maxLength={120} />
          </label>
          <label>
            Username
            <input value={data.username} onChange={set('username')} autoComplete="off" maxLength={200} />
          </label>
          <label>
            Password
            <div className="inline-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={data.password}
                onChange={set('password')}
                autoComplete="new-password"
                required
                maxLength={512}
              />
              <button type="button" className="ghost-button" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setData((p) => ({ ...p, password: generatePassword({ length: 20, uppercase: true, numbers: true, symbols: true }) }));
                  setShowPassword(true);
                }}
              >
                Generate
              </button>
            </div>
            {strength && <span className={`strength ${strength.toLowerCase()}`}>{strength}</span>}
          </label>
          <label>
            Site
            <input value={data.url} onChange={(e) => { set('url')(e); setReputation(null); }} placeholder="example.com" maxLength={2048} />
            {urlReport?.valid && (
              <button
                type="button"
                className="ghost-button"
                disabled={checkingUrl}
                onClick={async () => {
                  setCheckingUrl(true);
                  setReputation(await checkUrlReputation(data.url));
                  setCheckingUrl(false);
                }}
              >
                {checkingUrl ? 'Checking…' : 'Check site reputation'}
              </button>
            )}
            {reputation?.status === 'unsafe' && (
              <span className="url-finding high">Flagged by Safe Browsing: {reputation.threats.join(', ')}</span>
            )}
            {reputation?.status === 'no-known-threats' && (
              <span className="url-finding low">No known threats found (this is not a guarantee).</span>
            )}
            {reputation?.status === 'error' && <span className="url-finding medium">{reputation.message}</span>}
            {urlReport?.findings.map((f) => (
              <span key={f.code} className={`url-finding ${f.severity}`}>
                {f.message}
              </span>
            ))}
          </label>
          <label>
            Category
            <select value={data.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea value={data.notes} onChange={set('notes')} rows={3} maxLength={5000} />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Encrypting…' : 'Save'}
            </button>
            <button type="button" className="ghost-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
