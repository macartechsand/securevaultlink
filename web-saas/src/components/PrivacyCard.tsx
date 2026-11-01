import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/messages';
import { SNAPSHOT_FIELD_LABELS, getShareMetrics, setShareMetrics } from '../services/supportService';

/** Lets the user see and control what support can see about their account. */
export function PrivacyCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void getShareMetrics().then(setEnabled);
  }, []);

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Privacidade e suporte</p>
          <h2>O que o suporte vê</h2>
        </div>
        {enabled !== null && <span className={`badge ${enabled ? 'badge--info' : ''}`}>{enabled ? 'Métricas compartilhadas' : 'Métricas desligadas'}</span>}
      </div>
      <p className="muted">
        Ninguém, nem administradores, consegue ver o conteúdo do seu cofre: títulos, usuários, senhas, sites, notas, campos e
        arquivos são criptografados no seu dispositivo. Para um suporte mais preciso, o app pode enviar só{' '}
        <strong>contagens</strong> da sua postura de segurança:
      </p>
      <p className="subtle">{Object.values(SNAPSHOT_FIELD_LABELS).join(' · ')}</p>
      <p className="subtle">
        O suporte também vê metadados do servidor: datas de acesso, sessões, provedores de login, uso de espaço, quantidade de
        itens e compartilhamentos, e o log de auditoria.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled ?? true}
          disabled={enabled === null || busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            setError('');
            try {
              await setShareMetrics(next);
              setEnabled(next);
            } catch (err) {
              setError(friendlyError(err));
            } finally {
              setBusy(false);
            }
          }}
        />
        Compartilhar métricas de segurança (só números) com o suporte
      </label>
      {error && <div className="alert alert--error">{error}</div>}
    </section>
  );
}
