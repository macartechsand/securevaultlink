import { supabase } from '../lib/supabase';

export type ClientAuditEvent =
  | 'vault.unlocked'
  | 'vault.unlock_failed'
  | 'vault.recovered'
  | 'vault.locked'
  | 'file.downloaded'
  | 'file.shared_downloaded'
  | 'mfa.enrolled'
  | 'mfa.disabled'
  | 'session.others_signed_out'
  | 'client.error';

/**
 * Records a client-side event in the audit log. Best effort: never throws and never blocks the
 * user action. Never pass secrets, plaintext or keys in `details`.
 */
export function logClientEvent(
  event: ClientAuditEvent,
  target?: { type: string; id: string },
  details: Record<string, string | number | boolean | null> = {},
) {
  void supabase
    .rpc('log_client_event', {
      p_event: event,
      p_target_type: target?.type ?? null,
      p_target_id: target?.id ?? null,
      p_details: details,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export type AuditEvent = {
  id: number;
  event: string;
  targetType: string | null;
  targetId: string | null;
  source: 'server' | 'client';
  details: Record<string, unknown>;
  createdAt: string;
};

export async function fetchMyAuditEvents(limit = 200): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, event, target_type, target_id, source, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<
      { id: number; event: string; target_type: string | null; target_id: string | null; source: 'server' | 'client'; details: Record<string, unknown>; created_at: string }[]
    >();
  if (error) throw new Error(`Loading activity failed: ${error.message}`);
  return (data ?? []).map((e) => ({
    id: e.id,
    event: e.event,
    targetType: e.target_type,
    targetId: e.target_id,
    source: e.source,
    details: e.details ?? {},
    createdAt: e.created_at,
  }));
}
