import { supabase } from '../lib/supabase';
import type { PostureInput } from '../lib/posture';
import { logClientEvent } from './auditService';

export type SessionInfo = {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  userAgent: string | null;
  ip: string | null;
  aal: string | null;
  isCurrent: boolean;
};

export async function fetchSessions(): Promise<SessionInfo[]> {
  const { data, error } = await supabase.rpc('my_sessions');
  if (error) throw new Error(`Falha ao carregar as sessões: ${error.message}`);
  return ((data ?? []) as { id: string; created_at: string; last_active_at: string; user_agent: string | null; ip: string | null; aal: string | null; is_current: boolean }[]).map(
    (s) => ({
      id: s.id,
      createdAt: s.created_at,
      lastActiveAt: s.last_active_at,
      userAgent: s.user_agent,
      ip: s.ip,
      aal: s.aal,
      isCurrent: s.is_current,
    }),
  );
}

export async function revokeSession(id: string) {
  const { error } = await supabase.rpc('revoke_my_session', { p_session: id });
  if (error) throw new Error(`Falha ao encerrar a sessão: ${error.message}`);
}

export async function signOutOtherSessions() {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw new Error(`Falha ao encerrar as outras sessões: ${error.message}`);
  logClientEvent('session.others_signed_out');
}

export async function fetchSharingExposure(): Promise<PostureInput['exposure']> {
  const { data, error } = await supabase.rpc('my_sharing_exposure');
  const row = (data as Record<string, number>[] | null)?.[0];
  if (error || !row) return null;
  return {
    itemShares: row.item_shares,
    itemSharesNoExpiry: row.item_shares_no_expiry,
    itemSharesEdit: row.item_shares_edit,
    fileShares: row.file_shares,
    fileSharesNoExpiry: row.file_shares_no_expiry,
    activeTransfers: row.active_transfers,
  };
}
