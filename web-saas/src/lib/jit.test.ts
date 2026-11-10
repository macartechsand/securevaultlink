import { describe, expect, it } from 'vitest'
import { fromBase64, toBase64 } from './crypto/encoding'
import { durationLabel, jitStatus, openJitLabel, openJitReason, sealJitLabel, sealJitReason } from './jit'

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const
async function person() {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])
  const publicKey = toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const privateKey = await crypto.subtle.importKey('pkcs8', fromBase64(toBase64(pkcs8)), ECDH, false, ['deriveBits'])
  return { publicKey, privateKey }
}

describe('jit sealing', () => {
  it('the label opens only for the eligible person and the same item', async () => {
    const member = await person()
    const other = await person()
    const sealed = await sealJitLabel(member.publicKey, 'item-1', 'member-1', { title: 'AWS produção', username: 'root', url: 'https://console.aws.amazon.com/x' })
    expect(sealed).not.toContain('AWS')
    expect(await openJitLabel(member.privateKey, member.publicKey, sealed, 'item-1', 'member-1')).toEqual({
      title: 'AWS produção',
      username: 'root',
      host: 'console.aws.amazon.com',
    })
    await expect(openJitLabel(other.privateKey, other.publicKey, sealed, 'item-1', 'member-1')).rejects.toThrow()
    await expect(openJitLabel(member.privateKey, member.publicKey, sealed, 'item-2', 'member-1')).rejects.toThrow()
  })

  it('the justification is required and opens only for the owner', async () => {
    const owner = await person()
    await expect(sealJitReason(owner.publicKey, 'elig-1', 'owner-1', 'curto')).rejects.toThrow(/motivo/)
    const sealed = await sealJitReason(owner.publicKey, 'elig-1', 'owner-1', '  Deploy de emergência do chamado 1234  ')
    expect(await openJitReason(owner.privateKey, owner.publicKey, sealed, 'elig-1', 'owner-1')).toBe('Deploy de emergência do chamado 1234')
    await expect(openJitReason(owner.privateKey, owner.publicKey, sealed, 'elig-2', 'owner-1')).rejects.toThrow()
  })

  it('status and labels', () => {
    const now = Date.parse('2026-11-10T12:00:00Z')
    expect(jitStatus({ status: 'approved', expires_at: '2026-11-10T12:30:00Z' }, now)).toBe('active')
    expect(jitStatus({ status: 'approved', expires_at: '2026-11-10T11:59:00Z' }, now)).toBe('expired')
    expect(jitStatus({ status: 'pending', expires_at: null }, now)).toBe('pending')
    expect(durationLabel(30)).toBe('30 min')
    expect(durationLabel(120)).toBe('2 h')
  })
})
