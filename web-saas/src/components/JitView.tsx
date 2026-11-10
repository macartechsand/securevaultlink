import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { JIT_DURATIONS, JIT_REASON_MIN, JIT_STATUS_LABEL, type JitLabel, durationLabel, jitStatus, openJitLabel, openJitReason, sealJitLabel, sealJitReason } from '../lib/jit';
import { formatDateTime, friendlyError } from '../lib/messages';
import { findRecipient, type UserKeyPair } from '../services/fileService';
import * as jit from '../services/jitService';
import type { VaultItem } from '../state/itemOps';
import { Icon } from './ui/Icon';

type JitViewProps = {
  userId: string;
  items: VaultItem[];
  premium: boolean;
  getKeyPair: () => Promise<UserKeyPair>;
  sealItemKeyFor: (itemId: string, recipientPublicKey: string, recipientId: string) => Promise<string>;
  /** Reloads the vault so an approved access shows up among "shared with me". */
  onOpenVault: () => Promise<void>;
};

type Data = jit.JitData;

const STATUS_BADGE = { pending: 'badge--warn', active: 'badge--ok', expired: '', denied: 'badge--danger', revoked: '', cancelled: '' } as const;

/** Just-in-time access with approval: nobody keeps the key; the owner's device seals it per request. */
export function JitView({ userId, items, premium, getKeyPair, sealItemKeyFor, onOpenVault }: JitViewProps) {
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [labels, setLabels] = useState<Map<string, JitLabel>>(new Map());
  const [reasons, setReasons] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const next = await jit.fetchJit(userId);
      setData(next);
      setNow(Date.now());
      if (!next) return;
      const pair = await getKeyPair();
      const nextLabels = new Map<string, JitLabel>();
      for (const e of next.eligibility.filter((x) => x.member_id === userId)) {
        try {
          nextLabels.set(e.id, await openJitLabel(pair.privateKey, pair.publicKey, e.sealed_label, e.item_id, e.member_id));
        } catch {
          /* unreadable label: shown as "item protegido" */
        }
      }
      const nextReasons = new Map<string, string>();
      for (const r of next.requests.filter((x) => x.owner_id === userId)) {
        try {
          nextReasons.set(r.id, await openJitReason(pair.privateKey, pair.publicKey, r.sealed_reason, r.eligibility_id, r.owner_id));
        } catch {
          /* ignore */
        }
      }
      setLabels(nextLabels);
      setReasons(nextReasons);
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar os acessos.'));
    }
  }, [getKeyPair, userId]);

  // "Rotate after use": a password changed after the access ended clears the pending rotation by itself.
  useEffect(() => {
    if (!data) return;
    const changed = data.rotationDue.filter((d) => {
      const item = items.find((i) => i.id === d.item_id);
      const at = item?.data.passwordUpdatedAt ? Date.parse(item.data.passwordUpdatedAt) : 0;
      return at > Date.parse(d.due_from);
    });
    if (changed.length === 0) return;
    void Promise.all(changed.map((d) => jit.clearRotationDue(d.request_id).catch(() => undefined))).then(() => load());
  }, [data, items, load]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setError('');
    setInfo('');
    setBusy(key);
    try {
      await fn();
      if (done) setInfo(done);
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível concluir.'));
    } finally {
      setBusy('');
    }
  };

  const titleOf = useMemo(() => new Map(items.map((i) => [i.id, i.data.title || '(sem título)'])), [items]);
  const eligibilityById = useMemo(() => new Map((data?.eligibility ?? []).map((e) => [e.id, e])), [data]);

  if (data === undefined) return <section className="card"><p className="muted">Carregando…</p></section>;
  if (data === null)
    return (
      <section className="card">
        <h2>Acesso temporário</h2>
        <p className="muted">Este ambiente ainda não tem o recurso (falta aplicar a migration 20261110000000).</p>
      </section>
    );

  const mine = data.requests.filter((r) => r.owner_id === userId);
  const approverOf = new Set(data.approvers.filter((a) => a.approver_id === userId).map((a) => a.eligibility_id));
  // Pending requests I can decide: as the owner, or as a named approver (dual control).
  const pending = data.requests.filter(
    (r) => jitStatus(r, now) === 'pending' && r.requester_id !== userId && (r.owner_id === userId || approverOf.has(r.eligibility_id)),
  );
  const rotationDue = data.rotationDue.filter((d) => Date.parse(d.due_from) <= now);
  const active = mine.filter((r) => jitStatus(r, now) === 'active');
  const myEligibility = data.eligibility.filter((e) => e.owner_id === userId);
  const canAsk = data.eligibility.filter((e) => e.member_id === userId);
  const history = data.requests.filter((r) => !['pending', 'active'].includes(jitStatus(r, now))).slice(0, 15);

  return (
    <div className="grid">
      {error && <div className="alert alert--error">{error}</div>}
      {info && <div className="alert alert--ok">{info}</div>}

      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Para você aprovar</p>
            <h2>
              Pedidos pendentes <span className="muted">({pending.length})</span>
            </h2>
          </div>
        </div>
        <p className="subtle">
          Ao aprovar, o seu aparelho libera a chave do item só para essa pessoa e só pelo tempo pedido. O SecureLink nunca tem a
          chave: sem a sua aprovação, ninguém abre o item, nem o servidor.
        </p>
        {pending.length === 0 ? (
          <p className="muted">Nenhum pedido esperando.</p>
        ) : (
          <ul className="plain-list">
            {pending.map((r) => {
              const e = eligibilityById.get(r.eligibility_id);
              const required = e?.approvals_required ?? 1;
              const approvedByMe = data.myApprovals.has(r.id);
              return (
              <li key={r.id} className="jit-card">
                <div>
                  <strong>{titleOf.get(r.item_id) ?? 'Item'}</strong> · {e?.member_email ?? 'pessoa'} pede{' '}
                  <strong>{durationLabel(r.minutes)}</strong>
                  <div className="subtle">
                    Pedido em {formatDateTime(r.created_at)}
                    {r.owner_id !== userId && ` · item de ${e?.owner_email ?? 'outra pessoa'}`}
                  </div>
                  {required > 1 && (
                    <span className="badge badge--info">
                      {r.approvals ?? 0} de {required} aprovações
                    </span>
                  )}
                  <blockquote className="jit-reason">
                    {r.owner_id === userId ? reasons.get(r.id) ?? 'Justificativa ilegível' : 'A justificativa é cifrada para o dono do item.'}
                  </blockquote>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={Boolean(busy) || approvedByMe}
                    onClick={() =>
                      void run(r.id, async () => {
                        const publicKey = await jit.requesterKey(r.id);
                        const sealed = await sealItemKeyFor(r.item_id, publicKey, r.requester_id);
                        const until = await jit.approve(r.id, sealed);
                        setInfo(
                          until
                            ? `Acesso liberado por ${durationLabel(r.minutes)}.`
                            : `Aprovação registrada. Faltam ${Math.max(1, required - (r.approvals ?? 0) - 1)} aprovação(ões) de outra pessoa.`,
                        );
                      })
                    }
                  >
                    <Icon name="check" size={14} />
                    {approvedByMe ? 'Você aprovou' : 'Aprovar'}
                  </button>
                  <button type="button" className="btn btn--sm" disabled={Boolean(busy)} onClick={() => void run(r.id, () => jit.deny(r.id), 'Pedido recusado.')}>
                    Recusar
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {active.length > 0 && (
        <section className="card">
          <p className="eyebrow">Em uso agora</p>
          <h2>Acessos ativos</h2>
          <ul className="plain-list">
            {active.map((r) => (
              <li key={r.id} className="row-between">
                <div>
                  <strong>{titleOf.get(r.item_id) ?? 'Item'}</strong> · {eligibilityById.get(r.eligibility_id)?.member_email}
                  <div className="subtle">Até {formatDateTime(r.expires_at!)}</div>
                </div>
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={Boolean(busy)}
                  onClick={() => void run(r.id, () => jit.end(r.id), 'Acesso encerrado. Recomendado: troque a senha (a pessoa pode ter copiado).')}
                >
                  Encerrar agora
                </button>
              </li>
            ))}
          </ul>
          <p className="subtle">Depois do uso, troque a senha pela fila de Rotação: assim ela vale uma vez só.</p>
        </section>
      )}

      {rotationDue.length > 0 && (
        <section className="card">
          <p className="eyebrow">Trocar após o uso</p>
          <h2>
            Senhas para trocar <span className="muted">({rotationDue.length})</span>
          </h2>
          <p className="subtle">
            Estes itens exigem troca de senha depois de cada acesso temporário: a pessoa pode ter copiado a senha. Troque pela fila
            de Rotação (um clique nos itens com conector). Ao salvar a senha nova, o aviso some sozinho.
          </p>
          <ul className="plain-list">
            {rotationDue.map((d) => (
              <li key={d.request_id} className="row-between">
                <span>
                  <strong>{titleOf.get(d.item_id) ?? 'Item'}</strong> · acesso encerrado em {formatDateTime(d.due_from)}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (window.confirm('Dispensar a troca? Faça isso só se a senha já foi trocada por fora do SecureLink.'))
                      void run(d.request_id, () => jit.clearRotationDue(d.request_id), 'Aviso dispensado.');
                  }}
                >
                  Já troquei
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <EligibilityCard
        premium={premium}
        items={items.filter((i) => i.access === 'owner' && i.version === 2 && (i.data.type === 'login' || i.data.type === 'secret'))}
        rows={myEligibility}
        approvers={data.approvers}
        titleOf={titleOf}
        busy={busy}
        onAddApprover={(row, email) =>
          run(
            row.id,
            async () => {
              const person = await findRecipient(email.trim());
              if (!person) throw new Error('Não encontrei uma conta com esse e-mail que já tenha aberto o cofre.');
              await jit.addApprover(row.id, person.userId);
            },
            'Aprovador adicionado.',
          )
        }
        onRemoveApprover={(row, approverId) => run(row.id, () => jit.removeApprover(row.id, approverId), 'Aprovador removido.')}
        onSetRequired={(row, required) => run(row.id, () => jit.setApprovalsRequired(row.id, required), 'Regra de aprovação salva.')}
        onAdd={(item, email, maxMinutes, rotateAfterUse) =>
          run(
            'add',
            async () => {
              const recipient = await findRecipient(email.trim());
              if (!recipient) throw new Error('Não encontrei uma conta com esse e-mail que já tenha aberto o cofre.');
              const pair = await getKeyPair();
              const sealed = await sealJitLabel(recipient.publicKey, item.id, recipient.userId, item.data);
              await jit.createEligibility({
                item_id: item.id,
                member_id: recipient.userId,
                owner_public_key: pair.publicKey,
                sealed_label: sealed,
                max_minutes: maxMinutes,
                rotate_after_use: rotateAfterUse,
              });
            },
            'Pronto: essa pessoa já pode pedir acesso.',
          )
        }
        onRemove={(row) => run(row.id, () => jit.removeEligibility(row.id), 'Removido.')}
      />

      <section className="card">
        <p className="eyebrow">Para você pedir</p>
        <h2>
          Acessos sob aprovação <span className="muted">({canAsk.length})</span>
        </h2>
        {canAsk.length === 0 ? (
          <p className="muted">Ninguém liberou pedidos de acesso para você.</p>
        ) : (
          <ul className="plain-list">
            {canAsk.map((e) => {
              const label = labels.get(e.id);
              const last = data.requests.find((r) => r.eligibility_id === e.id && r.requester_id === userId);
              const status = last ? jitStatus(last, now) : null;
              return (
                <li key={e.id} className="jit-card">
                  <div>
                    <strong>{label?.title || 'Item protegido'}</strong>
                    {label?.username ? ` · ${label.username}` : ''}
                    {label?.host ? ` · ${label.host}` : ''}
                    <div className="subtle">
                      De {e.owner_email ?? 'dono'} · até {durationLabel(e.max_minutes)} por pedido
                      {(e.approvals_required ?? 1) > 1 && ` · ${e.approvals_required} aprovações`}
                    </div>
                    {status && <span className={`badge ${STATUS_BADGE[status]}`}>{JIT_STATUS_LABEL[status]}</span>}
                    {status === 'active' && <span className="subtle"> até {formatDateTime(last!.expires_at!)}</span>}
                  </div>
                  {status === 'pending' ? (
                    <button type="button" className="btn btn--sm" disabled={Boolean(busy)} onClick={() => void run(last!.id, () => jit.end(last!.id), 'Pedido cancelado.')}>
                      Cancelar pedido
                    </button>
                  ) : status === 'active' ? (
                    <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={() => void run('open', onOpenVault)}>
                      <Icon name="key" size={14} />
                      Abrir no cofre
                    </button>
                  ) : (
                    <RequestForm
                      maxMinutes={e.max_minutes}
                      busy={busy === e.id}
                      onSubmit={(minutes, reason) =>
                        run(
                          e.id,
                          async () => jit.requestAccess(e.id, minutes, await sealJitReason(e.owner_public_key, e.id, e.owner_id, reason)),
                          (e.approvals_required ?? 1) > 1
                            ? `Pedido enviado. Precisa de ${e.approvals_required} aprovações (dono e aprovadores).`
                            : 'Pedido enviado. O dono precisa aprovar no aparelho dele.',
                        )
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section className="card">
          <p className="eyebrow">Histórico</p>
          <h2>Pedidos encerrados</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quem</th>
                  <th>Duração</th>
                  <th>Situação</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const e = eligibilityById.get(r.eligibility_id);
                  const status = jitStatus(r, now);
                  return (
                    <tr key={r.id}>
                      <td>{r.owner_id === userId ? titleOf.get(r.item_id) ?? 'Item' : labels.get(r.eligibility_id)?.title ?? 'Item protegido'}</td>
                      <td>{r.owner_id === userId ? e?.member_email : 'você'}</td>
                      <td>{durationLabel(r.minutes)}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[status]}`}>{JIT_STATUS_LABEL[status]}</span>
                      </td>
                      <td>{formatDateTime(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function RequestForm({ maxMinutes, busy, onSubmit }: { maxMinutes: number; busy: boolean; onSubmit: (minutes: number, reason: string) => Promise<void> }) {
  const options = JIT_DURATIONS.filter((d) => d <= maxMinutes);
  const [minutes, setMinutes] = useState<number>(options[0] ?? 15);
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(minutes, reason).then(() => setReason(''));
  };
  return (
    <form className="form jit-form" onSubmit={submit}>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Por que você precisa do acesso? (mín. ${JIT_REASON_MIN} caracteres; só o dono lê)`}
        rows={2}
        maxLength={1000}
        required
      />
      <div className="row">
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {options.map((d) => (
            <option key={d} value={d}>
              {durationLabel(d)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || reason.trim().length < JIT_REASON_MIN}>
          Pedir acesso
        </button>
      </div>
    </form>
  );
}

function EligibilityCard({
  premium,
  items,
  rows,
  approvers,
  titleOf,
  busy,
  onAdd,
  onRemove,
  onAddApprover,
  onRemoveApprover,
  onSetRequired,
}: {
  premium: boolean;
  items: VaultItem[];
  rows: jit.JitEligibilityRow[];
  approvers: jit.JitApproverRow[];
  titleOf: Map<string, string>;
  busy: string;
  onAdd: (item: VaultItem, email: string, maxMinutes: number, rotateAfterUse: boolean) => Promise<void>;
  onRemove: (row: jit.JitEligibilityRow) => Promise<void>;
  onAddApprover: (row: jit.JitEligibilityRow, email: string) => Promise<void>;
  onRemoveApprover: (row: jit.JitEligibilityRow, approverId: string) => Promise<void>;
  onSetRequired: (row: jit.JitEligibilityRow, required: number) => Promise<void>;
}) {
  const [itemId, setItemId] = useState('');
  const [email, setEmail] = useState('');
  const [max, setMax] = useState(60);
  const [rotateAfterUse, setRotateAfterUse] = useState(true);
  const [approverEmail, setApproverEmail] = useState<Record<string, string>>({});
  const item = items.find((i) => i.id === itemId);
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Controle</p>
          <h2>Quem pode pedir acesso</h2>
        </div>
        {!premium && <span className="badge badge--info">Premium</span>}
      </div>
      <p className="subtle">
        A pessoa vê só o nome do item, o usuário e o site, nunca a senha, até você aprovar um pedido. Cada acesso tem prazo e
        fica na auditoria.
      </p>
      {premium ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (item) void onAdd(item, email, max, rotateAfterUse).then(() => setEmail(''));
          }}
        >
          <div className="grid grid--2">
            <label className="field">
              Item
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Escolha um login ou segredo</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.data.title || '(sem título)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              E-mail da pessoa
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </div>
          <div className="row">
            <label className="field">
              Duração máxima por pedido
              <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
                {JIT_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {durationLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn--primary" disabled={busy === 'add' || !item || !email}>
              Permitir pedidos
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={rotateAfterUse} onChange={(e) => setRotateAfterUse(e.target.checked)} />
            Exigir troca da senha depois de cada acesso (recomendado)
          </label>
        </form>
      ) : (
        <p className="muted">Liberar acesso temporário com aprovação faz parte do Premium. Pedir acesso a itens de outras pessoas funciona em qualquer plano.</p>
      )}
      {rows.length > 0 && (
        <ul className="plain-list">
          {rows.map((r) => {
            const named = approvers.filter((a) => a.eligibility_id === r.id);
            const required = r.approvals_required ?? 1;
            const phase2 = r.approvals_required !== undefined;
            return (
              <li key={r.id} className="jit-card">
                <div className="row-between">
                  <span>
                    <strong>{titleOf.get(r.item_id) ?? 'Item'}</strong> · {r.member_email} · até {durationLabel(r.max_minutes)}{' '}
                    {r.rotate_after_use && <span className="badge">troca após uso</span>}
                  </span>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={Boolean(busy)} onClick={() => void onRemove(r)}>
                    Remover
                  </button>
                </div>
                {phase2 && premium && (
                  <div className="stack-sm">
                    <span className="subtle">
                      Controle duplo: você{named.length ? ` e ${named.map((a) => a.approver_email ?? 'aprovador').join(', ')}` : ''} podem aprovar.
                      Aprovadores precisam ter o item compartilhado com eles.
                    </span>
                    <label className="field">
                      Aprovações necessárias
                      <select value={required} disabled={Boolean(busy)} onChange={(e) => void onSetRequired(r, Number(e.target.value))}>
                        {Array.from({ length: Math.min(5, Math.max(required, 1 + named.length)) }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? '1 (qualquer um)' : `${n} pessoas diferentes`}
                          </option>
                        ))}
                      </select>
                    </label>
                    {named.map((a) => (
                      <div key={a.approver_id} className="row-between">
                        <span className="subtle">Aprovador: {a.approver_email}</span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={Boolean(busy) || required > named.length}
                          title={required > named.length ? 'Reduza as aprovações necessárias antes de remover' : undefined}
                          onClick={() => void onRemoveApprover(r, a.approver_id)}
                        >
                          Remover aprovador
                        </button>
                      </div>
                    ))}
                    {named.length < 4 && (
                      <form
                        className="row"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = approverEmail[r.id] ?? '';
                          if (value) void onAddApprover(r, value).then(() => setApproverEmail((m) => ({ ...m, [r.id]: '' })));
                        }}
                      >
                        <input
                          type="email"
                          placeholder="E-mail de outro aprovador"
                          value={approverEmail[r.id] ?? ''}
                          onChange={(e) => setApproverEmail((m) => ({ ...m, [r.id]: e.target.value }))}
                        />
                        <button type="submit" className="btn btn--sm" disabled={Boolean(busy) || !approverEmail[r.id]}>
                          Adicionar aprovador
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
