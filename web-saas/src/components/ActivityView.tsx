import { useEffect, useState } from 'react';
import { type AuditEvent, fetchMyAuditEvents } from '../services/auditService';

const LABELS: Record<string, string> = {
  'vault.created': 'Vault created',
  'vault.unlocked': 'Vault unlocked',
  'vault.unlock_failed': 'Failed unlock attempt',
  'vault.locked': 'Vault locked',
  'vault.recovered': 'Vault recovered with recovery key',
  'vault.master_password_changed': 'Master password changed',
  'vault.recovery_enabled': 'Recovery key turned on',
  'vault.recovery_regenerated': 'Recovery key regenerated',
  'vault.recovery_disabled': 'Recovery key turned off',
  'vault.entry_created': 'Credential added',
  'vault.entry_updated': 'Credential edited',
  'vault.entry_deleted': 'Credential deleted',
  'file.uploaded': 'File uploaded',
  'file.upload_rejected': 'Upload rejected (size mismatch)',
  'file.deleted': 'File deleted',
  'file.downloaded': 'File downloaded',
  'file.shared': 'File shared',
  'file.received': 'File shared with you',
  'file.share_removed': 'Share removed',
  'file.shared_downloaded': 'Shared file downloaded',
  'transfer.created': 'Transfer link created',
  'transfer.downloaded': 'Transfer downloaded',
  'transfer.revoked': 'Transfer revoked',
  'keys.sharing_keypair_created': 'Sharing keys created',
  'mfa.enrolled': 'Two-factor authentication turned on',
  'mfa.disabled': 'Two-factor authentication turned off',
  'session.others_signed_out': 'Other sessions signed out',
  'client.error': 'App error reported',
};

const SENSITIVE = new Set(['vault.unlock_failed', 'vault.recovered', 'vault.recovery_disabled', 'mfa.disabled', 'file.upload_rejected']);

function describe(e: AuditEvent) {
  const d = e.details;
  const parts: string[] = [];
  if (typeof d.recipient === 'string') parts.push(`to ${d.recipient}`);
  if (typeof d.from === 'string') parts.push(`from ${d.from}`);
  if (typeof d.expires_at === 'string') parts.push(`expires ${new Date(d.expires_at).toLocaleString()}`);
  if (d.expires_at === null && (e.event === 'file.shared' || e.event === 'file.received')) parts.push('no expiry');
  if (typeof d.download === 'number') parts.push(`download ${d.download} of ${d.of}`);
  if (d.password === true) parts.push('password protected');
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load activity.'));
  }, []);

  const shown = (events ?? []).filter((e) => filter === 'all' || e.event.startsWith(filter));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Audit log</p>
          <h3>Account activity</h3>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter events">
          <option value="all">All events</option>
          <option value="vault.">Vault</option>
          <option value="file.">Files</option>
          <option value="transfer.">Transfers</option>
          <option value="mfa.">Two-factor</option>
        </select>
      </div>
      <p className="subheadline">
        Events marked <em>server</em> are recorded by the database itself. Events marked <em>app</em> are reported by this
        app and are informative.
      </p>
      {error && <div className="form-error">{error}</div>}
      {!events && !error && <p className="subheadline">Loading…</p>}
      {events && shown.length === 0 && <p className="empty-state">No events yet.</p>}
      {shown.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Details</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={SENSITIVE.has(e.event) ? 'status-pill at-risk' : undefined}>{LABELS[e.event] ?? e.event}</span>
                  </td>
                  <td>{describe(e)}</td>
                  <td>{e.source === 'server' ? 'server' : 'app'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
