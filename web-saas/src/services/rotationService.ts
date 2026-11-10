import { rotateOnDevice } from '../lib/clientRotation';
import type { AutoRotation } from '../lib/items';
import { supabase } from '../lib/supabase';
import { logClientEvent } from './auditService';

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

/**
 * Rotates on the platform. On this device when the connector supports it here (GitLab in the browser,
 * Cloudflare in the desktop app): the credential never reaches SecureVault's servers. Otherwise through
 * the `rotate` Edge Function (per-item consent required).
 */
export async function rotateCredential(auto: AutoRotation, credential: Credential, admin?: Credential, itemId?: string): Promise<RotationResult & { onDevice?: boolean }> {
  const local = await rotateOnDevice(auto.connectorId, credential.secret, (auto.config ?? {}) as Record<string, string>);
  if (local) {
    logClientEvent('item.rotated_on_device', itemId ? { type: 'vault_entry', id: itemId } : undefined, { connector: auto.connectorId, verified: local.verified });
    return { ...local, onDevice: true };
  }
  // itemId is an opaque id recorded in the audit trail (evidence report); never a secret.
  return invokeRotate<RotationResult>({ action: 'rotate', connector: auto.connectorId, credential, admin, config: auto.config, itemId });
}

/** Second phase: removes the previous credential, authenticated with the NEW one (already saved). */
export function revokeOldCredential(auto: AutoRotation, credential: Credential, oldId: string, newKeyId?: string, itemId?: string) {
  return invokeRotate<{ ok: true }>({ action: 'revoke_old', connector: auto.connectorId, credential, config: auto.config, oldId, newKeyId, itemId });
}
