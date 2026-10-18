import { supabase } from '../lib/supabase';

/** Administrator API. Every call is re-checked by the server (admin role + MFA session). */

export type AdminStatus = { role: 'admin' | 'support'; mfaOk: boolean } | null;

export async function fetchAdminStatus(): Promise<AdminStatus> {
  const { data, error } = await supabase.rpc('my_admin_status');
  const row = (data as { role: 'admin' | 'support'; mfa_ok: boolean }[] | null)?.[0];
  if (error || !row) return null;
  return { role: row.role, mfaOk: row.mfa_ok };
}

export type AdminOverview = Record<string, number | string | null>;

export async function fetchOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw new Error(error.message);
  return data as AdminOverview;
}

export type AdminUser = {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  banned_until: string | null;
  plan: 'free' | 'premium';
  mfa_factors: number;
  has_vault: boolean;
  recovery: boolean;
  items: number;
  files: number;
  storage_bytes: number;
  failed_unlocks_7d: number;
  client_errors_7d: number;
};

export async function listUsers(search: string, offset = 0, limit = 50): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users', { p_search: search.trim(), p_limit: limit, p_offset: offset });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
}

export type AdminEvent = {
  id: number;
  event: string;
  target_type: string | null;
  target_id: string | null;
  source: string;
  details: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
};

export async function userEvents(userId: string): Promise<AdminEvent[]> {
  const { data, error } = await supabase.rpc('admin_user_events', { p_user: userId, p_limit: 100 });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminEvent[];
}

export async function setPlan(userId: string, plan: 'free' | 'premium') {
  const { error } = await supabase.rpc('admin_set_plan', { p_user: userId, p_plan: plan });
  if (error) throw new Error(error.message);
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_revoke_sessions', { p_user: userId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

async function callAdmin<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin', { body });
  if (error) {
    let message = 'A função de administração não respondeu (verifique se foi publicada).';
    try {
      const ctx = (error as { context?: Response }).context;
      const payload = ctx ? await ctx.json() : null;
      if (payload?.error) message = payload.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return data as T;
}

export const resetUserMfa = (userId: string) => callAdmin<{ ok: boolean; removed: number }>({ action: 'reset_mfa', userId });
export const suspendUser = (userId: string) => callAdmin<{ ok: boolean }>({ action: 'suspend', userId });
export const unsuspendUser = (userId: string) => callAdmin<{ ok: boolean }>({ action: 'unsuspend', userId });
export const systemHealth = () => callAdmin<{ checks: Record<string, boolean | null> }>({ action: 'health' });

/* ------------------------------------------------------------------ closed beta */

export type BetaSettings = {
  settings: Record<string, string>;
  users: number;
  invites: { email: string; note: string | null; created_at: string; registered: boolean }[];
};

export async function fetchBetaSettings(): Promise<BetaSettings> {
  const { data, error } = await supabase.rpc('admin_get_settings');
  if (error) throw new Error(error.message);
  return data as BetaSettings;
}

export async function setSetting(key: string, value: string) {
  const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value });
  if (error) throw new Error(error.message);
}

export async function inviteEmail(email: string, note: string) {
  const { error } = await supabase.rpc('admin_invite', { p_email: email, p_note: note || null });
  if (error) throw new Error(error.message);
}

export async function uninviteEmail(email: string) {
  const { error } = await supabase.rpc('admin_uninvite', { p_email: email });
  if (error) throw new Error(error.message);
}
