import { useState } from 'react';
import { friendlyError } from '../lib/messages';
import { supabase } from '../lib/supabase';

/** Self-service account deletion (LGPD). Irreversible: vault, files, shares and logs are erased. */
export function DeleteAccountCard({ onDeleted }: { onDeleted: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    if (!window.confirm('Excluir sua conta e TODOS os dados? Não há como desfazer.')) return;
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('account', { body: { action: 'delete', confirm: typed } });
    if (err || !data?.ok) {
      let message = 'Não foi possível excluir a conta.';
      try {
        const ctx = (err as { context?: Response } | null)?.context;
        const payload = ctx ? await ctx.json() : null;
        if (payload?.error) message = payload.error;
      } catch {
        /* keep default */
      }
      setError(friendlyError(message));
      setBusy(false);
      return;
    }
    onDeleted();
  };

  return (
    <section className="card danger-zone">
      <div>
        <p className="eyebrow">Zona de perigo</p>
        <h2>Excluir minha conta</h2>
        <p className="subtle">
          Apaga definitivamente o cofre, os arquivos, os compartilhamentos que você fez, as transferências e o log de
          atividade. Faça um backup antes, se quiser guardar algo. Quem tinha itens compartilhados por você perde o acesso.
        </p>
      </div>
      <label className="field">
        Digite EXCLUIR para confirmar
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      {error && <div className="alert alert--error">{error}</div>}
      <div>
        <button type="button" className="btn btn--danger" disabled={busy || typed !== 'EXCLUIR'} onClick={() => void remove()}>
          {busy ? 'Excluindo…' : 'Excluir conta e todos os dados'}
        </button>
      </div>
    </section>
  );
}
