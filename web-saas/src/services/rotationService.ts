import type { AutoRotation } from '../lib/items';
import { supabase } from '../lib/supabase';

export type RotationResult = {
  /** New secret value (never logged; the caller encrypts it into the vault right away). */
  secret: string;
  /** Replaces the item's identifier when the platform issues a new one (AWS access key ID). */
  identifier?: string;
  /** Platform id of the new credential, kept in the item's rotation config. */
  keyId?: string;
  expiresAt?: string | null;
  /** Previous credential, removed only after the new one is saved (revokeOldCredential). */
  revokeOldId?: string;
  /** True when the new credential was used successfully against the platform. */
  verified: boolean;
  warning?: string;
};

type Credential = { id: string; secret: string };

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
export function rotateCredential(auto: AutoRotation, credential: Credential, admin?: Credential) {
  return invokeRotate<RotationResult>({ action: 'rotate', connector: auto.connectorId, credential, admin, config: auto.config });
}

/** Second phase: removes the previous credential, authenticated with the NEW one (already saved). */
export function revokeOldCredential(auto: AutoRotation, credential: Credential, oldId: string, newKeyId?: string) {
  return invokeRotate<{ ok: true }>({ action: 'revoke_old', connector: auto.connectorId, credential, config: auto.config, oldId, newKeyId });
}
