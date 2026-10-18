import { useState } from 'react';
import { describeUserAgent } from '../lib/posture';
import { supabase } from '../lib/supabase';
import { fetchMyAuditEvents } from '../services/auditService';
import { BUCKET, type KeyContext, type UserKeyPair, fetchPlanLimits } from '../services/fileService';
import { getAssuranceLevel } from '../services/mfaService';
import { Icon } from './ui/Icon';

type Check = { label: string; ok: boolean | null; detail: string };

async function functionReachable(name: string, body: Record<string, unknown>) {
  // A request the function rejects with 4xx proves it is deployed and reachable, without side effects.
  const { error } = await supabase.functions.invoke(name, { body });
  const status = (error as { context?: Response } | null)?.context?.status;
  if (!error) return { ok: true, detail: 'respondeu' };
  if (status && status >= 400 && status < 500) return { ok: true, detail: `publicada (HTTP ${status} esperado)` };
  return { ok: false, detail: status ? `HTTP ${status}` : 'sem resposta (não publicada ou bloqueada)' };
}

async function shortHash(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Self-service troubleshooting. The report contains no secrets, no email and no vault data. */
export function DiagnosticsCard({
  getKeyContext,
  getKeyPair,
  itemCount,
  undecryptable,
}: {
  getKeyContext: () => KeyContext;
  getKeyPair: () => Promise<UserKeyPair>;
  itemCount: number;
  undecryptable: number;
}) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    setCopied(false);
    const out: Check[] = [];
    const add = (label: string, ok: boolean | null, detail: string) => out.push({ label, ok, detail });
    const attempt = async (label: string, fn: () => Promise<string>) => {
      try {
        add(label, true, await fn());
      } catch (err) {
        add(label, false, err instanceof Error ? err.message.slice(0, 120) : 'falhou');
      }
    };

    add('Contexto seguro (HTTPS)', window.isSecureContext, window.isSecureContext ? 'ok' : 'abra pelo endereço https ou localhost');
    add('Criptografia do navegador (WebCrypto)', Boolean(crypto?.subtle), crypto?.subtle ? 'disponível' : 'indisponível: use um navegador atualizado');
    add('Área de transferência', Boolean(navigator.clipboard), navigator.clipboard ? 'disponível' : 'indisponível neste navegador');
    await attempt('Conexão com o servidor', async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error('sessão inválida; entre novamente');
      return 'sessão válida';
    });
    await attempt('Verificação em duas etapas', async () => {
      const level = await getAssuranceLevel();
      return level.current === 'aal2' ? 'sessão verificada (aal2)' : level.next === 'aal2' ? 'código pendente' : 'não ativada';
    });
    add('Cofre', undecryptable === 0, `${itemCount} item(ns) abertos${undecryptable ? `, ${undecryptable} não descriptografados` : ''}`);
    await attempt('Chaves de compartilhamento', async () => {
      await getKeyPair();
      return 'carregadas';
    });
    await attempt('Plano e limites', async () => {
      const l = await fetchPlanLimits();
      return `${l.plan === 'premium' ? 'Premium' : 'Gratuito'}; compartilhamento até ${l.maxShareHours} h`;
    });
    await attempt('Armazenamento de arquivos', async () => {
      const { error } = await supabase.storage.from(BUCKET).list(getKeyContext().userId, { limit: 1 });
      if (error) throw new Error(error.message);
      return 'acessível';
    });
    for (const [name, body] of [
      ['check-url', { urls: [] }],
      ['transfer', { id: '00000000-0000-0000-0000-000000000000', action: 'info' }],
    ] as const) {
      const r = await functionReachable(name, body);
      add(`Função ${name}`, r.ok, r.detail);
    }
    await attempt('Log de auditoria', async () => {
      const events = await fetchMyAuditEvents(1);
      return events.length ? 'registrando eventos' : 'sem eventos ainda';
    });

    setChecks(out);
    const lines = [
      `SecureLink Vault – diagnóstico ${new Date().toISOString()}`,
      `Navegador: ${describeUserAgent(navigator.userAgent)} · idioma ${navigator.language}`,
      `Conta: ${await shortHash(getKeyContext().userId)} (hash curto, não identifica o e-mail)`,
      `Build: ${import.meta.env.MODE}`,
      ...out.map((c) => `${c.ok ? '[OK]' : c.ok === false ? '[FALHA]' : '[--]'} ${c.label}: ${c.detail}`),
    ];
    setReport(lines.join('\n'));
    setRunning(false);
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Suporte</p>
          <h2>Diagnóstico</h2>
          <p className="subtle">Testa navegador, conexão, sessão, cofre, chaves, armazenamento e funções do servidor.</p>
        </div>
        <button type="button" className="btn" disabled={running} onClick={() => void run()}>
          <Icon name="refresh" />
          {running ? 'Testando…' : 'Executar diagnóstico'}
        </button>
      </div>
      {checks && (
        <ul className="list">
          {checks.map((c) => (
            <li key={c.label}>
              <span>
                <strong>{c.label}</strong>
                <span className="subtle block">{c.detail}</span>
              </span>
              <span className={`badge ${c.ok ? 'badge--ok' : c.ok === false ? 'badge--danger' : ''}`}>{c.ok ? 'OK' : c.ok === false ? 'Falha' : '—'}</span>
            </li>
          ))}
        </ul>
      )}
      {report && (
        <div className="stack-sm">
          <span className="subtle">Relatório para o suporte (não contém senhas, e-mail nem dados do cofre):</span>
          <textarea readOnly rows={6} value={report} className="mono" />
          <div>
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(report);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copiado' : 'Copiar relatório'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
