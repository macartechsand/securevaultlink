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
  /** Phase 2 (migration 20261112): approvals needed (owner + named approvers) and rotation after each use. */
  approvals_required?: number;
  rotate_after_use?: boolean;
};

export type JitApproverRow = { eligibility_id: string; approver_id: string; owner_id: string; approver_email: string | null };
export type JitRotationDueRow = { request_id: string; item_id: string; owner_id: string; due_from: string };

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
  approvals?: number;
};

const fail = (action: string, error: { message: string } | null): never => {
  throw new Error(`${action}${error ? `: ${error.message}` : ''}`);
};

export type JitData = {
  eligibility: JitEligibilityRow[];
  requests: JitRequestRow[];
  /** Empty when phase 2 is not applied yet. */
  approvers: JitApproverRow[];
  /** Request ids I already approved (phase 2). */
  myApprovals: Set<string>;
  rotationDue: JitRotationDueRow[];
};

const missing = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';

/** Returns null when the database has no JIT tables yet (migration not applied). */
export async function fetchJit(userId: string): Promise<JitData | null> {
  const [e, r, a, mine, due] = await Promise.all([
    supabase.from('jit_eligibility').select('*').order('created_at', { ascending: false }),
    supabase.from('jit_requests').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('jit_approvers').select('*'),
    supabase.from('jit_approvals').select('request_id').eq('approver_id', userId),
    supabase.from('jit_rotation_due').select('*'),
  ]);
  if (missing(e.error) || missing(r.error)) return null;
  if (e.error) fail('Falha ao carregar os acessos', e.error);
  if (r.error) fail('Falha ao carregar os pedidos', r.error);
  return {
    eligibility: (e.data ?? []) as JitEligibilityRow[],
    requests: (r.data ?? []) as JitRequestRow[],
    approvers: a.error ? [] : ((a.data ?? []) as JitApproverRow[]),
    myApprovals: new Set(mine.error ? [] : (mine.data ?? []).map((x) => (x as { request_id: string }).request_id)),
    rotationDue: due.error ? [] : ((due.data ?? []) as JitRotationDueRow[]),
  };
}

export async function createEligibility(row: {
  item_id: string;
  member_id: string;
  owner_public_key: string;
  sealed_label: string;
  max_minutes: number;
  approvals_required?: number;
  rotate_after_use?: boolean;
}) {
  // Phase 2 columns only when used, so the form keeps working before migration 20261112.
  const payload = { ...row };
  if (!payload.rotate_after_use) delete payload.rotate_after_use;
  if (!payload.approvals_required || payload.approvals_required === 1) delete payload.approvals_required;
  const { error } = await supabase.from('jit_eligibility').insert(payload);
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

/** Returns the access deadline, or null while more approvals are needed (dual control). */
export async function approve(requestId: string, sealedKey: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('jit_approve', { p_request: requestId, p_sealed_key: sealedKey });
  if (error) fail('Não foi possível aprovar', error);
  return (data as string | null) ?? null;
}

export async function addApprover(eligibilityId: string, approverId: string) {
  const { error } = await supabase.from('jit_approvers').insert({ eligibility_id: eligibilityId, approver_id: approverId });
  if (error) fail(error.code === '23505' ? 'Essa pessoa já é aprovadora' : 'Não foi possível adicionar o aprovador', error.code === '23505' ? null : error);
}

export async function removeApprover(eligibilityId: string, approverId: string) {
  const { error } = await supabase.from('jit_approvers').delete().eq('eligibility_id', eligibilityId).eq('approver_id', approverId);
  if (error) fail('Não foi possível remover o aprovador', error);
}

export async function setApprovalsRequired(eligibilityId: string, required: number) {
  const { error } = await supabase.from('jit_eligibility').update({ approvals_required: required }).eq('id', eligibilityId);
  if (error) fail('Não foi possível salvar', error);
}

/** Owner: the password was changed (or the owner accepts the risk): the rotation is no longer due. */
export async function clearRotationDue(requestId: string) {
  const { error } = await supabase.from('jit_rotation_due').delete().eq('request_id', requestId);
  if (error) fail('Não foi possível atualizar', error);
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
