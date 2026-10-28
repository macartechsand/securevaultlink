import { useState } from 'react';
import { connectorById } from '../lib/connectors';
import {
  ADMIN_LINKED_CONNECTORS,
  AUTO_CONNECTOR_IDS,
  AUTO_CONNECTOR_ITEM_TYPE,
  type AdminKeyKind,
  type AutoConnectorId,
  type AutoRotation,
  type AutoRotationConfig,
  type ItemType,
} from '../lib/items';

const ADMIN_KEY_LABEL: Record<AdminKeyKind, { field: string; missing: string }> = {
  aws: {
    field: 'Access key administrativa (outro segredo do cofre)',
    missing: 'Cadastre antes um Segredo com o Access key ID (AKIA…) em "Identificador" e a Secret no valor.',
  },
  entra: {
    field: 'App administrativo do Entra ID (outro segredo do cofre)',
    missing: 'Cadastre antes um Segredo com o Application (client) ID em "Identificador" e a client secret no valor.',
  },
  gcp: {
    field: 'Service account com delegação (outro segredo do cofre)',
    missing: 'Cadastre antes um Segredo com o arquivo JSON da service account no valor.',
  },
};
import { formatDateTime } from '../lib/messages';

const HINTS: Record<AutoConnectorId, string> = {
  'aws-iam-access-key': 'Coloque o Access key ID (AKIA…) em "Identificador" e a Secret access key em "Valor do segredo".',
  'aws-iam-console':
    'Coloque o nome do usuário IAM em "Usuário". A troca usa a access key de outro segredo do cofre (escolha abaixo); a senha atual do console não é enviada.',
  'gcp-service-account-key': 'Cole o arquivo JSON completo da chave da service account em "Valor do segredo". A chave antiga é removida depois de salvar a nova.',
  'entra-app-secret': 'Coloque o Application (client) ID em "Identificador" e a client secret em "Valor do segredo". A secret antiga é removida depois de salvar a nova.',
  'entra-user':
    'Coloque o e-mail da conta (ex.: maria@empresa.com) em "Usuário". A troca usa um app administrativo de outro segredo do cofre; a senha atual não é enviada. Contas Microsoft pessoais (Outlook, Hotmail) não têm API: use "Trocar em 1 clique".',
  'google-workspace-user':
    'Coloque o e-mail da conta Workspace em "Usuário". A troca usa uma service account de outro segredo do cofre; a senha atual não é enviada. Contas Gmail pessoais não têm API: use "Trocar em 1 clique".',
  'gitlab-pat': 'Coloque o token pessoal em "Valor do segredo". O GitLab revoga o token antigo na hora da rotação.',
  'cloudflare-api-token': 'Coloque o token de API (de usuário) em "Valor do segredo". O valor antigo deixa de valer na hora.',
};

type Props = {
  itemType: ItemType;
  value: AutoRotation | null;
  onChange: (v: AutoRotation | null) => void;
  /** Owner's secrets that hold an admin credential (AWS key, Entra app or Google service account). */
  adminKeyItems: { id: string; title: string; kind: AdminKeyKind }[];
  readOnly?: boolean;
};

/**
 * Per-item opt-in for one-click automatic rotation. Enabling requires an explicit consent, because the
 * credential is sent to the rotation function (TLS, nothing stored) while it rotates.
 */
export function AutoRotationFields({ itemType, value, onChange, adminKeyItems, readOnly }: Props) {
  const [pending, setPending] = useState<AutoConnectorId | ''>('');
  const [agreed, setAgreed] = useState(false);
  const options = AUTO_CONNECTOR_IDS.filter((id) => AUTO_CONNECTOR_ITEM_TYPE[id] === itemType);
  const selected = value?.connectorId ?? pending;
  if (options.length === 0) return null;

  const choose = (id: AutoConnectorId | '') => {
    setAgreed(false);
    if (value) onChange(null); // switching or turning off needs a new consent
    setPending(id);
  };
  const setConfig = (patch: Partial<AutoRotationConfig>) => value && onChange({ ...value, config: { ...value.config, ...patch } });

  return (
    <fieldset className="field">
      <legend>Rotação automática (1 clique)</legend>
      <select value={selected} onChange={(e) => choose(e.target.value as AutoConnectorId | '')} disabled={readOnly}>
        <option value="">{itemType === 'login' ? 'Desligada (troca em 1 clique pelo site)' : 'Desligada'}</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {connectorById(id)?.name} (beta)
          </option>
        ))}
      </select>
      {selected && <span className="field__hint">{HINTS[selected]}</span>}

      {!value && pending && (
        <div className="alert alert--warn stack-sm">
          <span>
            Para rotacionar, o app envia a credencial atual{pending === 'aws-iam-console' ? ' (aqui, a access key administrativa vinculada)' : ''}, por
            conexão cifrada, a uma função do servidor do SecureVault. Ela chama a API da plataforma, verifica a nova credencial e a
            devolve só para o seu navegador, que a cifra no cofre. <strong>Nada é armazenado nem registrado no servidor</strong>, mas,
            durante a troca, ele vê a credencial. Os outros itens continuam com criptografia de ponta a ponta total.
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
                <input value={value.config.baseUrl ?? ''} placeholder="https://gitlab.com" onChange={(e) => setConfig({ baseUrl: e.target.value.trim() || undefined })} readOnly={readOnly} />
              </label>
              <label className="field">
                Validade do novo token (dias)
                <input type="number" min={1} max={365} value={value.config.expiresInDays ?? ''} placeholder="90" onChange={(e) => setConfig({ expiresInDays: e.target.value || undefined })} readOnly={readOnly} />
              </label>
            </div>
          )}
          {value.connectorId === 'entra-app-secret' && (
            <div className="grid grid--2">
              <label className="field">
                Directory (tenant) ID
                <input
                  value={value.config.tenantId ?? ''}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(e) => setConfig({ tenantId: e.target.value.trim() || undefined })}
                  readOnly={readOnly}
                  required
                />
              </label>
              <label className="field">
                Validade da nova secret (dias)
                <input type="number" min={1} max={730} value={value.config.expiresInDays ?? ''} placeholder="180" onChange={(e) => setConfig({ expiresInDays: e.target.value || undefined })} readOnly={readOnly} />
              </label>
            </div>
          )}
          {value.connectorId === 'entra-user' && (
            <label className="field">
              Directory (tenant) ID
              <input
                value={value.config.tenantId ?? ''}
                placeholder="00000000-0000-0000-0000-000000000000 ou empresa.onmicrosoft.com"
                onChange={(e) => setConfig({ tenantId: e.target.value.trim() || undefined })}
                readOnly={readOnly}
                required
              />
            </label>
          )}
          {value.connectorId === 'google-workspace-user' && (
            <label className="field">
              E-mail do administrador representado
              <input
                type="email"
                value={value.config.adminEmail ?? ''}
                placeholder="admin@empresa.com"
                onChange={(e) => setConfig({ adminEmail: e.target.value.trim() || undefined })}
                readOnly={readOnly}
                required
              />
            </label>
          )}
          {ADMIN_LINKED_CONNECTORS[value.connectorId] && (
            <AdminKeyPicker
              kind={ADMIN_LINKED_CONNECTORS[value.connectorId]!}
              value={value.config.adminItemId}
              items={adminKeyItems}
              onChange={(adminItemId) => setConfig({ adminItemId })}
              readOnly={readOnly}
            />
          )}
          <span className="field__hint">
            Autorizado em {formatDateTime(value.consentAt)}
            {value.lastRotatedAt ? ` · última rotação ${formatDateTime(value.lastRotatedAt)}` : ''}. Salve o item e use "Rotacionar agora" em
            Rotação.
          </span>
        </>
      )}
    </fieldset>
  );
}

function AdminKeyPicker({
  kind,
  value,
  items,
  onChange,
  readOnly,
}: {
  kind: AdminKeyKind;
  value: string | undefined;
  items: { id: string; title: string; kind: AdminKeyKind }[];
  onChange: (id: string | undefined) => void;
  readOnly?: boolean;
}) {
  const candidates = items.filter((i) => i.kind === kind);
  return (
    <label className="field">
      {ADMIN_KEY_LABEL[kind].field}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} disabled={readOnly}>
        <option value="">Escolha…</option>
        {candidates.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      {candidates.length === 0 && <span className="field__hint">{ADMIN_KEY_LABEL[kind].missing}</span>}
    </label>
  );
}
