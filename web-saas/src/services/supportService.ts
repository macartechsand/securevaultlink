import { supabase } from '../lib/supabase';

/**
 * What the user's app shares with support: ONLY these numeric/boolean fields (enforced again by
 * report_posture on the server). Never titles, usernames, URLs, passwords or file names.
 */
export type PostureSnapshot = {
  score: number;
  items: number;
  logins: number;
  notes: number;
  secrets: number;
  cards: number;
  weak: number;
  reused: number;
  exposed: number;
  stale: number;
  rotation_due: number;
  rotation_scheduled: number;
  unsafe_sites: number;
  attachments: number;
  folders: number;
  shared_by_me: number;
  shared_with_me: number;
  security_check_ran: boolean;
  undecryptable: number;
  mfa: boolean;
  recovery: boolean;
};

export const SNAPSHOT_FIELD_LABELS: Record<keyof PostureSnapshot, string> = {
  score: 'Score de postura',
  items: 'Itens no cofre',
  logins: 'Logins',
  notes: 'Notas seguras',
  secrets: 'Segredos',
  cards: 'Cartões',
  weak: 'Senhas fracas',
  reused: 'Senhas reutilizadas',
  exposed: 'Senhas vazadas',
  stale: 'Senhas com mais de 1 ano',
  rotation_due: 'Trocas programadas vencidas',
  rotation_scheduled: 'Itens com troca programada',
  unsafe_sites: 'Sites perigosos',
  attachments: 'Anexos',
  folders: 'Pastas',
  shared_by_me: 'Itens que compartilhei',
  shared_with_me: 'Itens compartilhados comigo',
  security_check_ran: 'Verificação de segurança executada',
  undecryptable: 'Itens não descriptografados',
  mfa: 'Duas etapas ativa',
  recovery: 'Chave de recuperação ativa',
};

let lastSent = '';

/** Sends the numeric posture summary (deduplicated). Best effort: never blocks the UI. */
export function reportPosture(snapshot: PostureSnapshot) {
  const body = JSON.stringify(snapshot);
  if (body === lastSent) return;
  lastSent = body;
  void supabase.rpc('report_posture', { p_data: snapshot }).then(
    () => undefined,
    () => {
      lastSent = '';
    },
  );
}

export async function getShareMetrics(): Promise<boolean> {
  const { data } = await supabase.from('user_preferences').select('share_security_metrics').maybeSingle<{ share_security_metrics: boolean }>();
  return data?.share_security_metrics ?? true;
}

export async function setShareMetrics(enabled: boolean) {
  const { data: existing } = await supabase.from('user_preferences').select('user_id').maybeSingle();
  const { error } = existing
    ? await supabase.from('user_preferences').update({ share_security_metrics: enabled, updated_at: new Date().toISOString() }).not('user_id', 'is', null)
    : await supabase.from('user_preferences').insert({ share_security_metrics: enabled });
  if (error) throw new Error(`Falha ao salvar a preferência: ${error.message}`);
  lastSent = '';
  // Turning it off also deletes the snapshot already stored (report_posture does that server-side).
  if (!enabled) await supabase.rpc('report_posture', { p_data: {} });
}

export async function submitSupportReport(report: string) {
  const { error } = await supabase.rpc('submit_support_report', { p_report: report });
  if (error) throw new Error(error.message);
}

export type VaultStatus = { hasProfile: boolean; mfaSatisfied: boolean; mfaRequired: boolean; hasFactor: boolean };

/** RLS-independent vault status (null if the function is not deployed yet). */
export async function fetchVaultStatus(): Promise<VaultStatus | null> {
  const { data, error } = await supabase.rpc('my_vault_status');
  const row = (data as { has_profile: boolean; mfa_satisfied: boolean; mfa_required: boolean; has_factor: boolean }[] | null)?.[0];
  if (error || !row) return null;
  return { hasProfile: row.has_profile, mfaSatisfied: row.mfa_satisfied, mfaRequired: row.mfa_required, hasFactor: row.has_factor };
}

export async function fetchMfaRequired(): Promise<boolean> {
  const { data } = await supabase.rpc('my_security_policy');
  return Boolean((data as { mfa_required: boolean }[] | null)?.[0]?.mfa_required);
}
