/**
 * Just-in-time access with approval (migration 20261110000000). Reads go through RLS; every write that
 * changes access goes through an RPC that checks plan, ownership, MFA and deadlines on the server.
 */
import { supabase } from '../lib/supabase';

export type JitEligibilityRow = {
  id: string;
  item_id: string;
  owner_id: string;
  member_id: string;
  owner_email: string | null;
  member_email: string | null;
  owner_public_key: string;
  sealed_label: string;
  max_minutes: number;
  created_at: string;
};

export type JitRequestRow = {
  id: string;
  eligibility_id: string;
  item_id: string;
  owner_id: string;
  requester_id: string;
  sealed_reason: string;
  minutes: number;
  status: string;
  created_at: string;
  decided_at: string | null;
  expires_at: string | null;
};

const fail = (action: string, error: { message: string } | null): never => {
  throw new Error(`${action}${error ? `: ${error.message}` : ''}`);
};

/** Returns null when the database has no JIT tables yet (migration not applied). */
export async function fetchJit(): Promise<{ eligibility: JitEligibilityRow[]; requests: JitRequestRow[] } | null> {
  const [e, r] = await Promise.all([
    supabase.from('jit_eligibility').select('*').order('created_at', { ascending: false }),
    supabase.from('jit_requests').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  if (e.error?.code === '42P01' || r.error?.code === '42P01') return null;
  if (e.error) fail('Falha ao carregar os acessos', e.error);
  if (r.error) fail('Falha ao carregar os pedidos', r.error);
  return { eligibility: (e.data ?? []) as JitEligibilityRow[], requests: (r.data ?? []) as JitRequestRow[] };
}

export async function createEligibility(row: { item_id: string; member_id: string; owner_public_key: string; sealed_label: string; max_minutes: number }) {
  const { error } = await supabase.from('jit_eligibility').insert(row);
  if (error) fail(error.code === '23505' ? 'Essa pessoa já pode pedir acesso a este item' : 'Não foi possível liberar o pedido de acesso', error.code === '23505' ? null : error);
}

export async function removeEligibility(id: string) {
  const { error } = await supabase.from('jit_eligibility').delete().eq('id', id);
  if (error) fail('Não foi possível remover', error);
}

export async function requestAccess(eligibilityId: string, minutes: number, sealedReason: string) {
  const { error } = await supabase.rpc('jit_request', { p_eligibility: eligibilityId, p_minutes: minutes, p_sealed_reason: sealedReason });
  if (error) fail('Não foi possível enviar o pedido', error);
}

export async function requesterKey(requestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('jit_requester_key', { p_request: requestId });
  if (error || typeof data !== 'string') fail('A pessoa ainda não tem chave de compartilhamento (precisa abrir o cofre uma vez)', error);
  return data as string;
}

export async function approve(requestId: string, sealedKey: string): Promise<string> {
  const { data, error } = await supabase.rpc('jit_approve', { p_request: requestId, p_sealed_key: sealedKey });
  if (error) fail('Não foi possível aprovar', error);
  return data as string;
}

export async function deny(requestId: string) {
  const { error } = await supabase.rpc('jit_deny', { p_request: requestId });
  if (error) fail('Não foi possível recusar', error);
}

/** Owner: ends an active access. Requester: cancels a pending request. */
export async function end(requestId: string) {
  const { error } = await supabase.rpc('jit_end', { p_request: requestId });
  if (error) fail('Não foi possível encerrar', error);
}
