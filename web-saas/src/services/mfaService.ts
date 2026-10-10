import { supabase } from '../lib/supabase';

/** TOTP (authenticator app) MFA on top of Supabase Auth. Enforcement happens in RLS (aal2). */

export type TotpFactor = { id: string; friendlyName?: string; status: string };

export async function getAssuranceLevel() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message);
  return { current: data.currentLevel, next: data.nextLevel };
}

export async function listVerifiedTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name, status: f.status }));
}

/** Starts enrollment. Returns the QR code (SVG data URL) and the secret for manual entry. */
export async function enrollTotp() {
  // Drop abandoned, never-verified enrollments so a new one can be created.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw new Error(error.message);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) throw new Error('Invalid or expired code. Try again.');
}

export async function unenrollTotp(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
