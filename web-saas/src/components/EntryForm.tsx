import { type FormEvent, useState } from 'react';
import type { VaultItemData } from '../lib/crypto';
import { passwordStrength } from '../lib/health/passwordHealth';
import { CATEGORIES, STRENGTH_LABELS, categoryLabel, strengthBadge } from '../lib/labels';
import { friendlyError } from '../lib/messages';
import { generatePassword } from '../lib/passwordGenerator';
import { analyzeUrl } from '../lib/urlCheck';
import { checkUrlReputation, type UrlReputation } from '../services/urlReputation';
import { Icon } from './ui/Icon';

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
  const [confirmUnsafe, setConfirmUnsafe] = useState(false);

  const set = (key: keyof VaultItemData) => (e: { target: { value: string } }) =>
    setData((prev) => ({ ...prev, [key]: e.target.value }));

  const urlReport = data.url.trim() ? analyzeUrl(data.url) : null;
  const strength = data.password ? passwordStrength(data.password, [data.title, data.username]) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (data.url.trim() && !urlReport?.valid) {
      setError('Informe um endereço http(s) válido ou deixe o site em branco.');
      return;
    }
    setBusy(true);
    try {
      // Proactive reputation check of the site before saving. If it is flagged, require a second,
      // explicit confirmation. If the check is unavailable, saving is not blocked.
      if (data.url.trim() && !(reputation?.status === 'unsafe' && confirmUnsafe)) {
        const result = reputation ?? (await checkUrlReputation(data.url.trim()));
        setReputation(result);
        if (result.status === 'unsafe') {
          setConfirmUnsafe(true);
          setBusy(false);
          return;
        }
      }
      await onSubmit({ ...data, title: data.title.trim(), url: data.url.trim() });
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível salvar.'));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="entry-form-title">
      <div className="modal">
        <div className="card__header">
          <div>
            <p className="eyebrow">{initial ? 'Editar' : 'Nova'} credencial</p>
            <h2 id="entry-form-title">{initial ? 'Editar credencial' : 'Adicionar credencial'}</h2>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onCancel} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            Título
            <input value={data.title} onChange={set('title')} required maxLength={120} autoFocus />
          </label>
          <label className="field">
            Usuário ou e-mail
            <input value={data.username} onChange={set('username')} autoComplete="off" maxLength={200} />
          </label>
          <div className="field">
            <label htmlFor="entry-password">Senha</label>
            <div className="field__inline">
              <input
                id="entry-password"
                type={showPassword ? 'text' : 'password'}
                value={data.password}
                onChange={set('password')}
                autoComplete="new-password"
                required
                maxLength={512}
              />
              <button
                type="button"
                className="btn icon-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Icon name="eye" />
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setData((p) => ({ ...p, password: generatePassword({ length: 20, uppercase: true, numbers: true, symbols: true }) }));
                  setShowPassword(true);
                }}
              >
                <Icon name="wand" />
                Gerar
              </button>
            </div>
            {strength && (
              <span>
                <span className={`badge ${strengthBadge(strength)}`}>Força: {STRENGTH_LABELS[strength]}</span>
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="entry-url">Site</label>
            <div className="field__inline">
              <input
                id="entry-url"
                value={data.url}
                onChange={(e) => {
                  set('url')(e);
                  setReputation(null);
                  setConfirmUnsafe(false);
                }}
                placeholder="exemplo.com.br"
                maxLength={2048}
              />
              {urlReport?.valid && (
                <button
                  type="button"
                  className="btn"
                  disabled={checkingUrl}
                  onClick={async () => {
                    setCheckingUrl(true);
                    setReputation(await checkUrlReputation(data.url));
                    setCheckingUrl(false);
                  }}
                >
                  <Icon name="shield" />
                  {checkingUrl ? 'Verificando…' : 'Verificar'}
                </button>
              )}
            </div>
            {reputation?.status === 'unsafe' && (
              <span className="finding finding--high">
                Marcado como perigoso pelo Google Safe Browsing ({reputation.threats.join(', ')}). Não digite sua senha neste
                site.
              </span>
            )}
            {reputation?.status === 'no-known-threats' && (
              <span className="finding finding--low">Nenhuma ameaça conhecida encontrada (isso não é uma garantia).</span>
            )}
            {reputation?.status === 'error' && <span className="finding finding--medium">{reputation.message}</span>}
            {urlReport?.findings.map((f) => (
              <span key={f.code} className={`finding finding--${f.severity}`}>
                {f.message}
              </span>
            ))}
          </div>
          <label className="field">
            Categoria
            <select value={data.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Notas
            <textarea value={data.notes} onChange={set('notes')} rows={3} maxLength={5000} />
          </label>
          {error && <div className="alert alert--error">{error}</div>}
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Verificando e criptografando…' : confirmUnsafe ? 'Salvar mesmo assim' : 'Salvar'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
