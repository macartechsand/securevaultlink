import { type FormEvent, useEffect, useState } from 'react';
import { CONTINGENCY_EVENT, contingencyChecks, readMark, setMark } from '../lib/contingency';

type ContingencyCardProps = {
  userId: string;
  recoveryEnabled: boolean;
  mfaEnabled: boolean;
  onTestRecovery: (recoveryKey: string) => Promise<boolean>;
};

const BADGE = { ok: 'badge--ok', warn: 'badge--warn', missing: 'badge--danger' } as const;
const LABEL = { ok: 'Pronto', warn: 'Atenção', missing: 'Falta' } as const;

/** What to do when something goes wrong. Short, in the user's words; details in docs/product/contingency-plan.md. */
const SCENARIOS: { title: string; steps: string[] }[] = [
  {
    title: 'Esqueci a senha mestra',
    steps: [
      'Na tela de desbloqueio, escolha "Esqueci a senha mestra" e use a chave de recuperação para criar uma nova.',
      'Sem a chave de recuperação, ninguém consegue abrir o cofre, nem o suporte: os dados são cifrados só com as suas chaves. Restam o último backup exportado (abra com a senha da exportação) ou recomeçar o cofre do zero.',
    ],
  },
  {
    title: 'Esqueci a senha da conta (a de entrar)',
    steps: [
      'Use "Esqueci a senha da conta" na tela de entrada. Isso não mexe no cofre: a senha mestra continua a mesma.',
      'Durante o beta, se o e-mail não chegar, peça ao administrador um link de redefinição.',
    ],
  },
  {
    title: 'Perdi o celular com o autenticador',
    steps: [
      'Se fez backup do app autenticador, restaure-o num aparelho novo.',
      'Se não, peça ao administrador para redefinir a verificação em duas etapas. Ele confirma a sua identidade pelo canal combinado no convite antes de redefinir, e a ação fica registrada na auditoria.',
      'Depois, em "Sessões ativas", encerre a sessão do aparelho perdido.',
    ],
  },
  {
    title: 'Acho que alguém entrou na minha conta',
    steps: [
      'Em "Sessões ativas", encerre as outras sessões.',
      'Troque a senha da conta e a senha mestra (abaixo, em "Trocar a senha mestra").',
      'Confira em Atividade o que foi feito e troque as senhas das contas mais importantes pela fila de rotação.',
    ],
  },
  {
    title: 'O SecureLink está fora do ar',
    steps: [
      'Abra o último backup com o leitor offline (em "Exportar e importar", botão "Baixar leitor offline"). Ele funciona sem internet.',
      'A extensão com o cofre já aberto continua preenchendo até bloquear.',
    ],
  },
];

export function ContingencyCard({ userId, recoveryEnabled, mfaEnabled, onTestRecovery }: ContingencyCardProps) {
  const [, setTick] = useState(0);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'ok' | 'bad' | null>(null);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener(CONTINGENCY_EVENT, refresh);
    return () => window.removeEventListener(CONTINGENCY_EVENT, refresh);
  }, []);

  const { checks, ready } = contingencyChecks({
    recoveryEnabled,
    recoveryTestedAt: readMark('recoveryTestedAt', userId),
    mfaEnabled,
    lastExportAt: readMark('lastExportAt', userId),
    readerSavedAt: readMark('readerSavedAt', userId),
  });

  const test = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const ok = await onTestRecovery(key.trim());
      setResult(ok ? 'ok' : 'bad');
      if (ok) {
        setKey('');
        setMark('recoveryTestedAt', userId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Contingência</p>
          <h2>Se algo der errado</h2>
        </div>
        <span className={`badge ${ready ? 'badge--ok' : 'badge--warn'}`}>{ready ? 'Preparado' : 'Incompleto'}</span>
      </div>
      <p className="subtle">
        O que garante que você volta a entrar, ou pelo menos recupera os dados, se esquecer a senha mestra, perder o celular
        ou o SecureLink sair do ar.
      </p>

      <ul className="plain-list">
        {checks.map((c) => (
          <li key={c.id}>
            <span className={`badge ${BADGE[c.state]}`}>{LABEL[c.state]}</span> <strong>{c.title}</strong>
            <div className="subtle">{c.detail}</div>
          </li>
        ))}
      </ul>

      {recoveryEnabled && (
        <form className="form" onSubmit={test}>
          <label className="field">
            Testar a chave de recuperação (nada é alterado)
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setResult(null);
              }}
              placeholder="Cole ou digite a chave guardada"
            />
          </label>
          {result === 'ok' && <div className="alert alert--ok">A chave está correta e abre este cofre.</div>}
          {result === 'bad' && (
            <div className="alert alert--error">
              Essa chave não abre este cofre. Se não encontrar a certa, gere uma nova em "Chave de recuperação" (a antiga deixa
              de valer).
            </div>
          )}
          <div className="form__actions">
            <button type="submit" className="btn" disabled={busy || !key.trim()}>
              {busy ? 'Testando…' : 'Testar chave'}
            </button>
          </div>
        </form>
      )}

      <div>
        <p className="eyebrow">O que fazer se…</p>
        {SCENARIOS.map((s) => (
          <details key={s.title}>
            <summary>{s.title}</summary>
            <ol>
              {s.steps.map((step) => (
                <li key={step} className="muted">
                  {step}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}
