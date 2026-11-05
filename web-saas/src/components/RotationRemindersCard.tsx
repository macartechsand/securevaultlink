import { useState } from 'react';
import { isNativeShell } from '../lib/nativeShell';
import { DEADLINE_DAYS, SOON_DAYS } from '../lib/rotationDeadlines';
import { notificationsEnabled, notificationsSupported, setNotifications } from '../lib/rotationReminders';

/** Settings card: the deadline policy and the opt-in browser notification. */
export function RotationRemindersCard({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(() => notificationsEnabled(userId));
  const [error, setError] = useState('');
  const supported = notificationsSupported() && !isNativeShell();

  const toggle = async (on: boolean) => {
    setError('');
    const result = await setNotifications(userId, on).catch(() => false);
    setEnabled(result);
    if (on && !result) setError('O navegador não autorizou as notificações. Libere nas permissões do site e tente de novo.');
  };

  return (
    <section className="card">
      <div>
        <p className="eyebrow">Rotação</p>
        <h2>Prazos e avisos de troca</h2>
        <p className="subtle">
          Cada risco encontrado vira um prazo: senha vazada ou site perigoso, {DEADLINE_DAYS.exposed} dias; senha fraca,
          reutilizada ou com mais de 1 ano, {DEADLINE_DAYS.weak} dias; troca programada, a data definida no item. A
          verificação de vazamentos roda sozinha uma vez por dia, ao abrir o cofre.
        </p>
      </div>
      {supported ? (
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => void toggle(e.target.checked)} />
          Avisar por notificação do navegador quando houver troca vencida ou vencendo em até {SOON_DAYS} dias (no máximo
          um aviso por dia, só com a quantidade, sem nomes de sites)
        </label>
      ) : (
        <p className="subtle">Neste dispositivo, os avisos aparecem dentro do app: na Visão geral e na fila de rotação.</p>
      )}
      {error && <div className="alert alert--error">{error}</div>}
      <p className="subtle">Os prazos são calculados neste dispositivo; o servidor não sabe quais itens estão em risco.</p>
    </section>
  );
}
