import type { AutoRotation } from '../lib/items';
import { supabase } from '../lib/supabase';

export type RotationResult = {
  /** New secret value (never logged; the caller encrypts it into the vault right away). */
  secret: string;
  /** New identifier when the platform issues one (AWS access key ID). */
  id?: string;
  expiresAt?: string | null;
  /** AWS: the previous key, deleted only after the new one is saved (revokeOldCredential). */
  revokeOldId?: string;
  identity?: string;
};

async function invokeRotate<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('rotate', { body });
  if (!error && (data as { ok?: boolean } | null)?.ok) return data as T;
  let message = 'A rotação falhou. Nada foi salvo.';
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    const payload = ctx ? await ctx.json() : (data as { error?: string } | null);
    if (payload?.error) message = payload.error;
  } catch {
    /* keep default */
  }
  throw new Error(message);
}

/** Rotates on the platform through the `rotate` Edge Function (per-item consent required). */
export function rotateCredential(auto: AutoRotation, credential: { id: string; secret: string }) {
  return invokeRotate<RotationResult>({ action: 'rotate', connector: auto.connectorId, credential, config: auto.config });
}

/** AWS second phase: deletes the previous access key, signed with the NEW key (already saved). */
export function revokeOldCredential(auto: AutoRotation, credential: { id: string; secret: string }, oldId: string) {
  return invokeRotate<{ ok: true }>({ action: 'revoke_old', connector: auto.connectorId, credential, oldId });
}
