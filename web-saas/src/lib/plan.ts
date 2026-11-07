/**
 * What each plan includes (owner decision of 2026-11-06). The server enforces what it can see
 * (trash, usage records, automatic rotation); features that live inside encrypted items (OTP,
 * scheduled rotation) are gated in the apps. Downgrading never locks data: items already in the
 * trash can be restored, and OTP codes already saved keep working.
 */
export type Plan = 'free' | 'premium'

export type PremiumFeature = 'trash' | 'lastUsed' | 'emergencyMode' | 'otp' | 'rotation' | 'support' | 'emergencyContact'

export const PREMIUM_FEATURES: Record<PremiumFeature, string> = {
  trash: 'Lixeira de 14 dias',
  lastUsed: 'Onde e quando a senha foi usada',
  emergencyMode: 'Modo emergência (encerra todas as sessões)',
  otp: 'Códigos de verificação (OTP) de outros sistemas',
  rotation: 'Rotação de senhas (assistida, programada e em 1 clique)',
  support: 'Suporte',
  emergencyContact: 'Contato de emergência',
}

export const TRASH_DAYS = 14

export function hasFeature(plan: Plan, _feature: PremiumFeature): boolean {
  return plan === 'premium'
}
