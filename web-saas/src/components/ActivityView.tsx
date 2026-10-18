import { useEffect, useState } from 'react';
import { formatDateTime, friendlyError } from '../lib/messages';
import { type AuditEvent, fetchMyAuditEvents } from '../services/auditService';

const LABELS: Record<string, string> = {
  'vault.created': 'Cofre criado',
  'vault.unlocked': 'Cofre desbloqueado',
  'vault.unlock_failed': 'Tentativa de desbloqueio falhou',
  'vault.locked': 'Cofre bloqueado',
  'vault.recovered': 'Cofre recuperado com a chave de recuperação',
  'vault.master_password_changed': 'Senha mestra trocada',
  'vault.recovery_enabled': 'Chave de recuperação ativada',
  'vault.recovery_regenerated': 'Nova chave de recuperação gerada',
  'vault.recovery_disabled': 'Chave de recuperação desativada',
  'vault.entry_created': 'Credencial adicionada',
  'vault.entry_updated': 'Credencial editada',
  'vault.entry_deleted': 'Credencial excluída',
  'file.uploaded': 'Arquivo enviado',
  'file.upload_rejected': 'Envio rejeitado (tamanho divergente)',
  'file.deleted': 'Arquivo excluído',
  'file.downloaded': 'Arquivo baixado',
  'file.shared': 'Arquivo compartilhado',
  'file.received': 'Arquivo compartilhado com você',
  'file.share_removed': 'Compartilhamento removido',
  'file.shared_downloaded': 'Arquivo compartilhado baixado',
  'transfer.created': 'Link de transferência criado',
  'transfer.downloaded': 'Transferência baixada',
  'transfer.revoked': 'Transferência revogada',
  'keys.sharing_keypair_created': 'Chaves de compartilhamento criadas',
  'item.shared': 'Item compartilhado',
  'item.received': 'Item compartilhado com você',
  'item.share_removed': 'Compartilhamento de item removido',
  'item.share_permission_changed': 'Permissão de compartilhamento alterada',
  'mfa.enrolled': 'Verificação em duas etapas ativada',
  'mfa.disabled': 'Verificação em duas etapas desativada',
  'session.others_signed_out': 'Outras sessões encerradas',
  'session.revoked': 'Sessão encerrada',
  'client.error': 'Erro do aplicativo registrado',
};

const SENSITIVE = new Set(['vault.unlock_failed', 'vault.recovered', 'vault.recovery_disabled', 'mfa.disabled', 'file.upload_rejected']);

function describe(e: AuditEvent) {
  const d = e.details;
  const parts: string[] = [];
  if (typeof d.recipient === 'string') parts.push(`para ${d.recipient}`);
  if (typeof d.from === 'string') parts.push(`de ${d.from}`);
  if (typeof d.expires_at === 'string') parts.push(`expira em ${formatDateTime(d.expires_at)}`);
  if (d.expires_at === null && /\.(shared|received)$/.test(e.event)) parts.push('sem expiração');
  if (typeof d.download === 'number') parts.push(`download ${d.download} de ${d.of}`);
  if (d.password === true) parts.push('protegido por senha');
  if (d.permission === 'edit') parts.push('pode editar');
  if (d.permission === 'view') parts.push('somente leitura');
  return parts.join(' · ');
}

/** The user's own audit trail (server-recorded events plus client-reported ones, labeled). */
export function ActivityView() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchMyAuditEvents()
      .then(setEvents)
      .catch((err) => setError(friendlyError(err, 'Não foi possível carregar a atividade.')));
  }, []);

  const shown = (events ?? []).filter((e) => filter === 'all' || e.event.startsWith(filter));

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Log de auditoria</p>
          <h2>Atividade da conta</h2>
          <p className="subtle">
            Eventos de origem <strong>servidor</strong> são gravados pelo próprio banco de dados. Os de origem{' '}
            <strong>app</strong> são informados por este aplicativo e têm caráter informativo.
          </p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar eventos" className="filter-select">
          <option value="all">Todos os eventos</option>
          <option value="vault.">Cofre</option>
          <option value="item.">Compartilhamento de itens</option>
          <option value="file.">Arquivos</option>
          <option value="transfer.">Transferências</option>
          <option value="mfa.">Duas etapas</option>
        </select>
      </div>
      {error && <div className="alert alert--error">{error}</div>}
      {!events && !error && <p className="muted">Carregando…</p>}
      {events && shown.length === 0 && <p className="empty">Nenhum evento ainda.</p>}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Evento</th>
                <th>Detalhes</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{formatDateTime(e.createdAt)}</td>
                  <td>
                    <span className={SENSITIVE.has(e.event) ? 'badge badge--danger' : undefined}>{LABELS[e.event] ?? e.event}</span>
                  </td>
                  <td className="muted">{describe(e)}</td>
                  <td>
                    <span className={`badge ${e.source === 'server' ? 'badge--info' : ''}`}>{e.source === 'server' ? 'servidor' : 'app'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
