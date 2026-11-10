/**
 * Organizations and the company risk panel (migration 20261113000000). The panel only has the numeric
 * posture summary each member's own device reports: never item names, URLs or contents.
 */
import { supabase } from '../lib/supabase';

export type Org = { id: string; name: string; created_by: string; created_at: string };
export type OrgMember = { org_id: string; user_id: string; email: string | null; role: 'owner' | 'admin' | 'member'; joined_at: string };
export type OrgInvite = { org_id: string; email: string; role: 'admin' | 'member'; invited_at: string };
export type MyInvite = { org_id: string; org_name: string; role: string; invited_at: string; invited_by_email: string | null };
export type RiskRow = {
  user_id: string;
  email: string | null;
  role: OrgMember['role'];
  joined_at: string;
  last_sign_in_at: string | null;
  mfa: boolean;
  has_vault: boolean;
  reported_at: string | null;
  score: number | null;
  items: number | null;
  weak: number | null;
  reused: number | null;
  exposed: number | null;
  stale: number | null;
  rotation_due: number | null;
  unsafe_sites: number | null;
  recovery: boolean;
  shared_by_me: number | null;
};

const fail = (action: string, error: { message: string } | null): never => {
  throw new Error(`${action}${error ? `: ${error.message}` : ''}`);
};
const missing = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202';

/** null when the database has no organizations yet (migration not applied). */
export async function fetchOrgs(): Promise<{ orgs: Org[]; members: OrgMember[]; invites: OrgInvite[]; myInvites: MyInvite[] } | null> {
  const [o, m, i, mine] = await Promise.all([
    supabase.from('organizations').select('*').order('created_at'),
    supabase.from('org_members').select('*'),
    supabase.from('org_invites').select('*'),
    supabase.rpc('org_my_invites'),
  ]);
  if (missing(o.error) || missing(m.error)) return null;
  if (o.error) fail('Falha ao carregar as organizações', o.error);
  if (m.error) fail('Falha ao carregar os membros', m.error);
  return {
    orgs: (o.data ?? []) as Org[],
    members: (m.data ?? []) as OrgMember[],
    invites: i.error ? [] : ((i.data ?? []) as OrgInvite[]),
    myInvites: mine.error ? [] : ((mine.data ?? []) as MyInvite[]),
  };
}

const rpc = async (fn: string, args: Record<string, unknown>, action: string) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(action, error);
  return data;
};

export const createOrg = (name: string) => rpc('org_create', { p_name: name }, 'Não foi possível criar a organização');
export const invite = (org: string, email: string, role: 'admin' | 'member') =>
  rpc('org_invite', { p_org: org, p_email: email, p_role: role }, 'Não foi possível convidar');
export const cancelInvite = (org: string, email: string) => rpc('org_cancel_invite', { p_org: org, p_email: email }, 'Não foi possível cancelar');
export const accept = (org: string) => rpc('org_accept', { p_org: org }, 'Não foi possível aceitar');
export const decline = (org: string) => rpc('org_decline', { p_org: org }, 'Não foi possível recusar');
export const leave = (org: string) => rpc('org_leave', { p_org: org }, 'Não foi possível sair');
export const removeMember = (org: string, user: string) => rpc('org_remove_member', { p_org: org, p_user: user }, 'Não foi possível remover');
export const deleteOrg = (org: string) => rpc('org_delete', { p_org: org }, 'Não foi possível excluir');
export const fetchRisk = async (org: string) => ((await rpc('org_risk', { p_org: org }, 'Não foi possível carregar o painel')) ?? []) as RiskRow[];
