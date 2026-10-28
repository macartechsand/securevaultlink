import { describe, expect, it } from 'vitest'
import { emptyItem } from '../lib/items'
import type { VaultItem } from '../state/itemOps'
import { quickRotateMode } from './RotationView'

const item = (patch: Partial<VaultItem['data']>, access: VaultItem['access'] = 'owner') =>
  ({ id: 'i', access, createdAt: '2026-01-01T00:00:00Z', data: { ...emptyItem(patch.type ?? 'login'), ...patch } }) as unknown as VaultItem

const auto = { connectorId: 'gitlab-pat' as const, consentAt: '2026-10-28T10:00:00Z', config: {}, lastRotatedAt: null, expiresAt: null }

describe('quickRotateMode', () => {
  it('logins rotate with the one-click assisted flow', () => {
    expect(quickRotateMode(item({ type: 'login' }))).toBe('assisted')
    expect(quickRotateMode(item({ type: 'login' }, 'edit'))).toBe('assisted')
  })
  it('secrets rotate automatically only with consent and only for the owner', () => {
    expect(quickRotateMode(item({ type: 'secret', autoRotation: auto }))).toBe('auto')
    expect(quickRotateMode(item({ type: 'secret' }))).toBeNull()
    expect(quickRotateMode(item({ type: 'secret', autoRotation: auto }, 'edit'))).toBeNull()
  })
  it('view-only items never rotate', () => {
    expect(quickRotateMode(item({ type: 'login' }, 'view'))).toBeNull()
  })
})
