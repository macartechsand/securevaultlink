import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import type { PasswordHistoryEntry } from '../lib/crypto';
import { passwordStrength } from '../lib/health/passwordHealth';
import {
  type CustomField,
  ITEM_TYPES,
  type ItemType,
  LIMITS,
  SECRET_KINDS,
  type SecuredItemData,
  emptyItem,
  normalizeTags,
  validateItem,
} from '../lib/items';
import { ROTATION_INTERVALS } from '../lib/connectors';
import { AutoRotationFields } from './AutoRotationFields';
import { CATEGORIES, STRENGTH_LABELS, categoryLabel, strengthBadge } from '../lib/labels';
import { formatBytes, formatDateTime, friendlyError } from '../lib/messages';
import { generatePassword } from '../lib/passwordGenerator';
import { analyzeUrl } from '../lib/urlCheck';
import { type KeyContext, MAX_FILE_BYTES, type UserKeyPair, downloadAttachment, uploadVaultFile } from '../services/fileService';
import { checkUrlReputation, type UrlReputation } from '../services/urlReputation';
import type { Folder, VaultItem } from '../state/itemOps';
import { Icon } from './ui/Icon';

type ItemEditorProps = {
  item?: VaultItem;
  initialType?: ItemType;
  folders: Folder[];
  getKeyContext: () => KeyContext;
  getKeyPair: () => Promise<UserKeyPair>;
  getHistory: (item: VaultItem) => Promise<PasswordHistoryEntry[]>;
  onSave: (data: SecuredItemData) => Promise<void>;
  onCancel: () => void;
};

function SecretInput({
  id,
  value,
  onChange,
  readOnly,
  multiline = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  multiline?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="field__inline">
      {multiline && show ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} rows={4} spellCheck={false} />
      ) : (
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          autoComplete="new-password"
          spellCheck={false}
        />
      )}
      <button type="button" className="btn icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar' : 'Mostrar'} title={show ? 'Ocultar' : 'Mostrar'}>
        <Icon name="eye" />
      </button>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="Copiar"
        title="Copiar (limpa em 30 s)"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(async () => {
              try {
                if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
              } catch {
                /* ignore */
              }
              setCopied(false);
            }, 30_000);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>
  );
}

export function ItemEditor({ item, initialType = 'login', folders, getKeyContext, getKeyPair, getHistory, onSave, onCancel }: ItemEditorProps) {
  const [data, setData] = useState<SecuredItemData>(() => (item ? structuredClone(item.data) : emptyItem(initialType)));
  const [tagInput, setTagInput] = useState('');
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [history, setHistory] = useState<PasswordHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reputation, setReputation] = useState<UrlReputation | null>(null);
  const [confirmUnsafe, setConfirmUnsafe] = useState(false);

  const readOnly = item?.access === 'view';
  const isOwner = !item || item.access === 'owner';
  const set = <K extends keyof SecuredItemData>(key: K, value: SecuredItemData[K]) => setData((d) => ({ ...d, [key]: value }));
  const urlReport = data.url.trim() ? analyzeUrl(data.url) : null;
  const strength = data.type === 'login' && data.password ? passwordStrength(data.password, [data.title, data.username]) : null;

  useEffect(() => {
    if (tab === 'history' && item && history === null) {
      getHistory(item)
        .then(setHistory)
        .catch((err) => setError(friendlyError(err, 'Não foi possível carregar o histórico.')));
    }
  }, [tab, item, history, getHistory]);

  const updateField = (id: string, patch: Partial<CustomField>) =>
    set('customFields', data.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addTag = () => {
    const tags = normalizeTags([...data.tags, ...tagInput.split(',')]);
    set('tags', tags);
    setTagInput('');
  };

  const onAttach = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void (async () => {
      setError('');
      if (data.attachments.length >= LIMITS.attachments) return setError(`Use no máximo ${LIMITS.attachments} anexos por item.`);
      if (file.size > MAX_FILE_BYTES) return setError(`Cada anexo pode ter até ${formatBytes(MAX_FILE_BYTES)}.`);
      setBusy(`Criptografando e enviando ${file.name}…`);
      try {
        const uploaded = await uploadVaultFile(getKeyContext(), file);
        setData((d) => ({ ...d, attachments: [...d.attachments, { fileId: uploaded.id, name: file.name, size: file.size }] }));
      } catch (err) {
        setError(friendlyError(err, 'Não foi possível enviar o anexo.'));
      } finally {
        setBusy('');
      }
    })();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return onCancel();
    setError('');
    const clean: SecuredItemData = {
      ...data,
      title: data.title.trim(),
      url: data.url.trim(),
      tags: normalizeTags([...data.tags, ...tagInput.split(',')]),
      customFields: data.customFields.map((f) => ({ ...f, label: f.label.trim() })),
    };
    const problem = validateItem(clean);
    if (problem) return setError(problem);
    if (clean.url && !urlReport?.valid) return setError('Informe um endereço http(s) válido ou deixe o site em branco.');
    setBusy('Verificando e criptografando…');
    try {
      if (clean.url && !(reputation?.status === 'unsafe' && confirmUnsafe)) {
        const result = reputation ?? (await checkUrlReputation(clean.url));
        setReputation(result);
        if (result.status === 'unsafe') {
          setConfirmUnsafe(true);
          setBusy('');
          return;
        }
      }
      await onSave(clean);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível salvar.'));
      setBusy('');
    }
  };

  const title = readOnly ? 'Visualizar item' : item ? 'Editar item' : 'Novo item';
  const showUrl = data.type === 'login' || data.type === 'secret';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="item-editor-title">
      <div className="modal modal--wide">
        <div className="card__header">
          <div>
            <p className="eyebrow">
              {ITEM_TYPES.find((t) => t.value === data.type)?.label}
              {item && item.access !== 'owner' && ` · compartilhado por ${item.ownerEmail ?? 'outro usuário'} (${item.access === 'edit' ? 'pode editar' : 'somente leitura'})`}
            </p>
            <h2 id="item-editor-title">{title}</h2>
          </div>
          <button type="button" className="btn btn--ghost icon-btn" onClick={onCancel} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>

        {item && isOwner && (data.type === 'login' || data.type === 'secret') && (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className={`tab ${tab === 'details' ? 'is-active' : ''}`} onClick={() => setTab('details')}>
              Detalhes
            </button>
            <button type="button" role="tab" className={`tab ${tab === 'history' ? 'is-active' : ''}`} onClick={() => setTab('history')}>
              Histórico de senhas
            </button>
          </div>
        )}

        {tab === 'history' ? (
          <div className="stack">
            <p className="subtle">
              Versões anteriores, criptografadas só com a sua chave (quem recebeu o item compartilhado não vê). Guardamos as
              últimas {LIMITS.history}.
            </p>
            {history === null && <p className="muted">Carregando…</p>}
            {history?.length === 0 && <p className="empty">Nenhuma senha anterior ainda.</p>}
            {history && history.length > 0 && (
              <ul className="list">
                {history.map((h, i) => (
                  <li key={`${h.changedAt}-${i}`}>
                    <div className="stack-sm grow">
                      <span className="subtle">Substituída em {formatDateTime(h.changedAt)}</span>
                      <SecretInput id={`h-${i}`} value={h.password} onChange={() => undefined} readOnly />
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        set('password', h.password);
                        setTab('details');
                      }}
                    >
                      Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            {!item && (
              <div className="field">
                <span>Tipo</span>
                <div className="segmented">
                  {ITEM_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`segmented__item ${data.type === t.value ? 'is-active' : ''}`}
                      onClick={() => setData((d) => ({ ...d, type: t.value }))}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid--2">
              <label className="field">
                Título
                <input value={data.title} onChange={(e) => set('title', e.target.value)} required maxLength={LIMITS.title} readOnly={readOnly} autoFocus={!item} />
              </label>
              {isOwner ? (
                <label className="field">
                  Pasta
                  <select value={data.folderId ?? ''} onChange={(e) => set('folderId', e.target.value || null)} disabled={readOnly}>
                    <option value="">Sem pasta</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field">
                  Categoria
                  <input value={categoryLabel(data.category)} readOnly />
                </label>
              )}
            </div>

            {data.type === 'login' && (
              <>
                <label className="field">
                  Usuário ou e-mail
                  <input value={data.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" maxLength={200} readOnly={readOnly} />
                </label>
                <div className="field">
                  <label htmlFor="item-password">Senha</label>
                  <SecretInput id="item-password" value={data.password} onChange={(v) => set('password', v)} readOnly={readOnly} />
                  <div className="row">
                    {strength && <span className={`badge ${strengthBadge(strength)}`}>Força: {STRENGTH_LABELS[strength]}</span>}
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => set('password', generatePassword({ length: 20, uppercase: true, numbers: true, symbols: true }))}
                      >
                        <Icon name="wand" size={14} />
                        Gerar senha
                      </button>
                    )}
                    {data.passwordUpdatedAt && <span className="subtle">Alterada em {formatDateTime(data.passwordUpdatedAt)}</span>}
                  </div>
                </div>
              </>
            )}

            {data.type === 'secret' && (
              <>
                <label className="field">
                  Tipo de segredo
                  <select value={data.secretKind} onChange={(e) => set('secretKind', e.target.value as SecuredItemData['secretKind'])} disabled={readOnly}>
                    {SECRET_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Identificador (opcional)
                  <input value={data.username} onChange={(e) => set('username', e.target.value)} placeholder="ID da chave, conta, usuário…" readOnly={readOnly} />
                </label>
                <div className="field">
                  <label htmlFor="item-secret">Valor do segredo</label>
                  <SecretInput id="item-secret" value={data.password} onChange={(v) => set('password', v)} readOnly={readOnly} multiline />
                </div>
              </>
            )}

            {data.type === 'card' && (
              <div className="grid grid--2">
                <label className="field">
                  Nome no cartão
                  <input value={data.card.holder} onChange={(e) => set('card', { ...data.card, holder: e.target.value })} readOnly={readOnly} />
                </label>
                <div className="field">
                  <label htmlFor="card-number">Número</label>
                  <SecretInput id="card-number" value={data.card.number} onChange={(v) => set('card', { ...data.card, number: v })} readOnly={readOnly} />
                </div>
                <label className="field">
                  Validade (MM/AA)
                  <input value={data.card.expiry} onChange={(e) => set('card', { ...data.card, expiry: e.target.value })} placeholder="12/29" maxLength={5} readOnly={readOnly} />
                </label>
                <div className="field">
                  <label htmlFor="card-cvv">CVV</label>
                  <SecretInput id="card-cvv" value={data.card.cvv} onChange={(v) => set('card', { ...data.card, cvv: v })} readOnly={readOnly} />
                </div>
              </div>
            )}

            {(data.type === 'login' || data.type === 'secret') && (
              <label className="field">
                Troca programada
                <select value={data.rotationIntervalDays} onChange={(e) => set('rotationIntervalDays', Number(e.target.value))} disabled={readOnly}>
                  {ROTATION_INTERVALS.map((r) => (
                    <option key={r.days} value={r.days}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <span className="field__hint">Você recebe o lembrete na Visão geral e o item entra na fila de Rotação quando vencer.</span>
              </label>
            )}

            {data.type === 'secret' && isOwner && (
              <AutoRotationFields value={data.autoRotation} onChange={(v) => set('autoRotation', v)} readOnly={readOnly} />
            )}

            {showUrl && (
              <div className="field">
                <label htmlFor="item-url">Site</label>
                <input
                  id="item-url"
                  value={data.url}
                  onChange={(e) => {
                    set('url', e.target.value);
                    setReputation(null);
                    setConfirmUnsafe(false);
                  }}
                  placeholder="exemplo.com.br"
                  maxLength={2048}
                  readOnly={readOnly}
                />
                {reputation?.status === 'unsafe' && (
                  <span className="finding finding--high">
                    Marcado como perigoso pelo Google Safe Browsing ({reputation.threats.join(', ')}). Não digite senhas neste site.
                  </span>
                )}
                {reputation?.status === 'no-known-threats' && <span className="finding finding--low">Nenhuma ameaça conhecida (não é garantia).</span>}
                {reputation?.status === 'error' && <span className="finding finding--medium">{reputation.message}</span>}
                {urlReport?.findings.map((f) => (
                  <span key={f.code} className={`finding finding--${f.severity}`}>
                    {f.message}
                  </span>
                ))}
              </div>
            )}

            <label className="field">
              {data.type === 'note' ? 'Conteúdo da nota' : 'Notas'}
              <textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} rows={data.type === 'note' ? 8 : 3} maxLength={LIMITS.notes} readOnly={readOnly} />
              <span className="field__hint">
                {data.notes.length}/{LIMITS.notes} caracteres
              </span>
            </label>

            {/* Custom fields */}
            <div className="field">
              <div className="row-between">
                <span>
                  Campos personalizados <span className="subtle">({data.customFields.length}/{LIMITS.customFields})</span>
                </span>
                {!readOnly && data.customFields.length < LIMITS.customFields && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => set('customFields', [...data.customFields, { id: crypto.randomUUID(), label: '', value: '', hidden: false }])}
                  >
                    <Icon name="plus" size={14} />
                    Adicionar campo
                  </button>
                )}
              </div>
              {data.customFields.map((f) => (
                <div key={f.id} className="custom-field">
                  <input value={f.label} onChange={(e) => updateField(f.id, { label: e.target.value })} placeholder="Nome (ex.: PIN, Host)" maxLength={LIMITS.fieldLabel} readOnly={readOnly} />
                  {f.hidden ? (
                    <SecretInput id={`cf-${f.id}`} value={f.value} onChange={(v) => updateField(f.id, { value: v })} readOnly={readOnly} />
                  ) : (
                    <input value={f.value} onChange={(e) => updateField(f.id, { value: e.target.value })} placeholder="Valor" maxLength={LIMITS.fieldValue} readOnly={readOnly} />
                  )}
                  {!readOnly && (
                    <div className="row">
                      <label className="check">
                        <input type="checkbox" checked={f.hidden} onChange={(e) => updateField(f.id, { hidden: e.target.checked })} />
                        Ocultar
                      </label>
                      <button
                        type="button"
                        className="btn btn--ghost icon-btn btn--danger"
                        aria-label="Remover campo"
                        onClick={() => set('customFields', data.customFields.filter((x) => x.id !== f.id))}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tags, category, favorite */}
            {isOwner && (
              <div className="grid grid--2">
                <div className="field">
                  <label htmlFor="item-tags">Tags</label>
                  <div className="field__inline">
                    <input
                      id="item-tags"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="ex.: produção, banco"
                      readOnly={readOnly}
                    />
                    {!readOnly && (
                      <button type="button" className="btn btn--sm" onClick={addTag}>
                        Adicionar
                      </button>
                    )}
                  </div>
                  <div className="badges">
                    {data.tags.map((t) => (
                      <span key={t} className="badge badge--info">
                        {t}
                        {!readOnly && (
                          <button type="button" className="badge__remove" aria-label={`Remover tag ${t}`} onClick={() => set('tags', data.tags.filter((x) => x !== t))}>
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="stack-sm">
                  <label className="field">
                    Categoria
                    <select value={data.category} onChange={(e) => set('category', e.target.value)} disabled={readOnly}>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={data.favorite} onChange={(e) => set('favorite', e.target.checked)} disabled={readOnly} />
                    Favorito
                  </label>
                </div>
              </div>
            )}

            {/* Attachments */}
            <div className="field">
              <div className="row-between">
                <span>
                  Anexos <span className="subtle">({data.attachments.length}/{LIMITS.attachments}, até {formatBytes(MAX_FILE_BYTES)} cada)</span>
                </span>
                {isOwner && data.attachments.length < LIMITS.attachments && (
                  <label className={`btn btn--sm file-pick ${busy ? 'is-disabled' : ''}`}>
                    <Icon name="upload" size={14} />
                    Anexar arquivo
                    <input type="file" onChange={onAttach} hidden />
                  </label>
                )}
              </div>
              {data.attachments.length === 0 ? (
                <span className="subtle">Nenhum anexo.</span>
              ) : (
                <ul className="list">
                  {data.attachments.map((a) => (
                    <li key={a.fileId}>
                      <span className="row">
                        <Icon name="file" size={16} />
                        {a.name} <span className="subtle">{formatBytes(a.size)}</span>
                      </span>
                      <span className="row">
                        <button
                          type="button"
                          className="btn btn--ghost icon-btn"
                          aria-label="Baixar anexo"
                          onClick={async () => {
                            setError('');
                            try {
                              const keys = isOwner ? null : await getKeyPair();
                              await downloadAttachment(getKeyContext(), keys, a.fileId, a.name);
                            } catch (err) {
                              setError(friendlyError(err, 'Não foi possível baixar o anexo.'));
                            }
                          }}
                        >
                          <Icon name="download" size={16} />
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            className="btn btn--ghost icon-btn btn--danger"
                            aria-label="Remover anexo"
                            onClick={() => set('attachments', data.attachments.filter((x) => x.fileId !== a.fileId))}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {isOwner && <span className="field__hint">Remover da lista não apaga o arquivo; ele continua em Arquivos.</span>}
            </div>

            {busy && <div className="alert alert--info">{busy}</div>}
            {error && <div className="alert alert--error">{error}</div>}
            <div className="form__actions">
              {readOnly ? (
                <button type="button" className="btn btn--primary" onClick={onCancel}>
                  Fechar
                </button>
              ) : (
                <>
                  <button type="submit" className="btn btn--primary" disabled={Boolean(busy)}>
                    {confirmUnsafe ? 'Salvar mesmo assim' : 'Salvar'}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={onCancel}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
