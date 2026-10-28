import { useState } from 'react';
import { connectorById } from '../lib/connectors';
import { AUTO_CONNECTOR_IDS, type AutoConnectorId, type AutoRotation } from '../lib/items';
import { formatDateTime } from '../lib/messages';

const HINTS: Record<AutoConnectorId, string> = {
  'aws-iam-access-key': 'Coloque o Access key ID (AKIA…) em "Identificador" e a Secret access key em "Valor do segredo".',
  'gitlab-pat': 'Coloque o token pessoal em "Valor do segredo". O GitLab revoga o token antigo na hora da rotação.',
  'cloudflare-api-token': 'Coloque o token de API (de usuário) em "Valor do segredo". O valor antigo deixa de valer na hora.',
};

/**
 * Per-item opt-in for one-click automatic rotation. Enabling requires an explicit consent, because the
 * credential is sent to the rotation function (TLS, nothing stored) while it rotates.
 */
export function AutoRotationFields({ value, onChange, readOnly }: { value: AutoRotation | null; onChange: (v: AutoRotation | null) => void; readOnly?: boolean }) {
  const [pending, setPending] = useState<AutoConnectorId | ''>('');
  const [agreed, setAgreed] = useState(false);
  const selected = value?.connectorId ?? pending;

  const choose = (id: AutoConnectorId | '') => {
    setAgreed(false);
    if (!id) {
      setPending('');
      onChange(null);
    } else if (value) {
      // Switching connector needs a new consent.
      onChange(null);
      setPending(id);
    } else {
      setPending(id);
    }
  };

  return (
    <fieldset className="field">
      <legend>Rotação automática (1 clique)</legend>
      <select value={selected} onChange={(e) => choose(e.target.value as AutoConnectorId | '')} disabled={readOnly}>
        <option value="">Desligada</option>
        {AUTO_CONNECTOR_IDS.map((id) => (
          <option key={id} value={id}>
            {connectorById(id)?.name} (beta)
          </option>
        ))}
      </select>
      {selected && <span className="field__hint">{HINTS[selected]}</span>}

      {!value && pending && (
        <div className="alert alert--warn stack-sm">
          <span>
            Para rotacionar, o app envia a credencial atual, por conexão cifrada, a uma função do servidor do SecureVault. Ela chama
            a API da plataforma, verifica a nova credencial e a devolve só para o seu navegador, que a cifra no cofre.{' '}
            <strong>Nada é armazenado nem registrado no servidor</strong>, mas, durante a troca, ele vê a credencial. Os outros
            itens continuam com criptografia de ponta a ponta total.
          </span>
          <span className="subtle">Requer: {connectorById(pending)?.requires.join('; ')}</span>
          <label className="check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            Autorizo a rotação automática deste item nessas condições.
          </label>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={!agreed}
            onClick={() => {
              onChange({ connectorId: pending, consentAt: new Date().toISOString(), config: {}, lastRotatedAt: null, expiresAt: null });
              setPending('');
            }}
          >
            Ativar rotação automática
          </button>
        </div>
      )}

      {value && (
        <>
          {value.connectorId === 'gitlab-pat' && (
            <div className="grid grid--2">
              <label className="field">
                Endereço do GitLab
                <input
                  value={value.config.baseUrl ?? ''}
                  placeholder="https://gitlab.com"
                  onChange={(e) => onChange({ ...value, config: { ...value.config, baseUrl: e.target.value.trim() || undefined } })}
                  readOnly={readOnly}
                />
              </label>
              <label className="field">
                Validade do novo token (dias)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={value.config.expiresInDays ?? ''}
                  placeholder="90"
                  onChange={(e) => onChange({ ...value, config: { ...value.config, expiresInDays: e.target.value || undefined } })}
                  readOnly={readOnly}
                />
              </label>
            </div>
          )}
          <span className="field__hint">
            Autorizado em {formatDateTime(value.consentAt)}
            {value.lastRotatedAt ? ` · última rotação ${formatDateTime(value.lastRotatedAt)}` : ''}. Salve o item e use "Rotacionar agora"
            em Rotação.
          </span>
        </>
      )}
    </fieldset>
  );
}
